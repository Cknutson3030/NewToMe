
import { RequestHandler, Request } from "express";
import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}


// Buyer requests to purchase a listing
export const requestTransaction: RequestHandler = async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const buyerId = user?.id;
    const { listingId, offeredPrice, notes } = req.body;
    if (!buyerId || !listingId) throw new AppError(400, "Missing buyer or listing");
    if (offeredPrice === undefined || offeredPrice === null) throw new AppError(400, "Missing offered price");

    // Get listing and seller
    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id, owner_user_id, status")
      .eq("id", listingId)
      .eq("status", "active")
      .single();
    if (listingError || !listing) throw new AppError(404, "Listing not found or unavailable");
    if (listing.owner_user_id === buyerId) throw new AppError(400, "Cannot buy your own listing");

    // Create transaction (store offered price and optional notes)
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .insert({
        listing_id: listingId,
        buyer_id: buyerId,
        seller_id: listing.owner_user_id,
        status: "pending",
        offered_price: offeredPrice,
        notes: notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
};


// Seller approves or rejects a transaction
export const respondTransaction: RequestHandler = async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const sellerId = user?.id;
    const { transactionId, action } = req.body; // action: 'approved' or 'rejected'
    if (!sellerId || !transactionId || !["approved", "rejected"].includes(action)) {
      throw new AppError(400, "Invalid input");
    }
    // Get transaction
    const { data: txn, error: txnError } = await supabaseAdmin
      .from("transactions")
      .select("id, seller_id, listing_id, status")
      .eq("id", transactionId)
      .single();
    if (txnError || !txn) throw new AppError(404, "Transaction not found");
    if (txn.seller_id !== sellerId) throw new AppError(403, "Not your transaction");
    if (txn.status !== "pending") throw new AppError(400, "Transaction already processed");

    // Get buyer id from transaction
    const { data: fullTxn } = await supabaseAdmin
      .from("transactions")
      .select("buyer_id")
      .eq("id", transactionId)
      .single();

    // Update transaction status
    const { error: updateError } = await supabaseAdmin
      .from("transactions")
      .update({ status: action })
      .eq("id", transactionId);
    if (updateError) throw updateError;

    // If approved, mark listing as sold and award GHG credits
    if (action === "approved") {
      await supabaseAdmin
        .from("listings")
        .update({ status: "sold" })
        .eq("id", txn.listing_id);

      // Fetch listing GHG data to award credits
      const { data: listing } = await supabaseAdmin
        .from("listings")
        .select("ghg_manufacturing_kg, ghg_materials_kg, ghg_transport_kg, ghg_end_of_life_kg")
        .eq("id", txn.listing_id)
        .single();

      if (listing && fullTxn) {
        const buyerCredit =
          (Number(listing.ghg_manufacturing_kg) || 0) +
          (Number(listing.ghg_materials_kg) || 0) +
          (Number(listing.ghg_transport_kg) || 0);

        const sellerCredit = Number(listing.ghg_end_of_life_kg) || 0;

        // Award buyer credits (upsert profile row if missing)
        if (buyerCredit > 0) {
          await supabaseAdmin.rpc("increment_ghg_balance", {
            user_id: fullTxn.buyer_id,
            amount: buyerCredit,
          });
        }

        // Award seller credits
        if (sellerCredit > 0) {
          await supabaseAdmin.rpc("increment_ghg_balance", {
            user_id: sellerId,
            amount: sellerCredit,
          });
        }
      }
    }
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// Get transactions for current user (role: seller|buyer|all, optional status)
export const getMyTransactions: RequestHandler = async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const userId = user?.id;
    if (!userId) throw new AppError(401, 'Unauthorized');

    const { role = 'all', status } = req.query as any;

    // pagination support
    const limit = Math.min(parseInt(String(req.query.limit ?? '20')) || 20, 100);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0')) || 0, 0);

    let query = supabaseAdmin.from('transactions').select('id, listing_id, buyer_id, seller_id, status, offered_price, notes, created_at');

    if (role === 'seller') query = query.eq('seller_id', userId);
    else if (role === 'buyer') query = query.eq('buyer_id', userId);
    else query = query.or(`seller_id.eq.${userId},buyer_id.eq.${userId}`);

    if (status) query = query.eq('status', String(status));

    // apply ordering and range for pagination
    const start = offset;
    const end = offset + limit - 1;
    const { data, error } = await query.order('created_at', { ascending: false }).range(start, end);
    if (error) throw error;

    const rows = data ?? [];

    // Fetch listing titles in batch
    const listingIds = Array.from(new Set(rows.map((r: any) => String(r.listing_id)).filter(Boolean)));
    let listingsMap: Record<string, any> = {};
    if (listingIds.length > 0) {
      const { data: listingsData, error: listingsError } = await supabaseAdmin
        .from('listings')
        .select('id, title, price')
        .in('id', listingIds);
      if (!listingsError && listingsData) {
        listingsMap = (listingsData as any[]).reduce((acc: any, cur: any) => { acc[String(cur.id)] = cur; return acc; }, {});
      }
    }

    // Fetch first listing image per listing
    let listingImageMap: Record<string, string | null> = {};
    if (listingIds.length > 0) {
      const { data: imgsData, error: imgsError } = await supabaseAdmin
        .from('listing_images')
        .select('listing_id, image_url, sort_order')
        .in('listing_id', listingIds)
        .order('sort_order', { ascending: true });
      if (!imgsError && imgsData) {
        // pick first image per listing
        for (const row of imgsData as any[]) {
          const lid = String(row.listing_id);
          if (!listingImageMap[lid]) listingImageMap[lid] = row.image_url ?? null;
        }
      }
    }

    // Fetch user emails (buyer and seller) using admin API
    const userIds = Array.from(new Set(rows.flatMap((r: any) => [r.buyer_id, r.seller_id]).filter(Boolean).map(String)));
    const usersMap: Record<string, any> = {};
    await Promise.all(userIds.map(async (uid) => {
      try {
        // supabase-js v2 admin API
        const result = await (supabaseAdmin.auth as any).admin.getUserById(uid);
        const u = result?.data?.user ?? null;
        if (u) usersMap[uid] = u;
      } catch (e) {
        // ignore per-user fetch errors
      }
    }));

    // Attach listing title and user emails
    const enriched = rows.map((r: any) => ({
      ...r,
      listing_title: listingsMap[String(r.listing_id)]?.title ?? null,
      listing_price: listingsMap[String(r.listing_id)]?.price ?? null,
      listing_image_url: listingImageMap[String(r.listing_id)] ?? null,
      offered_price: r.offered_price ?? null,
      notes: r.notes ?? null,
      buyer_email: usersMap[String(r.buyer_id)]?.email ?? null,
      seller_email: usersMap[String(r.seller_id)]?.email ?? null,
    }));

    res.status(200).json({ data: enriched });
  } catch (error) {
    next(error);
  }
};
