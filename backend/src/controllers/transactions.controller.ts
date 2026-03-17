
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
    const { listingId } = req.body;
    if (!buyerId || !listingId) throw new AppError(400, "Missing buyer or listing");

    // Get listing and seller
    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id, owner_user_id, status")
      .eq("id", listingId)
      .eq("status", "active")
      .single();
    if (listingError || !listing) throw new AppError(404, "Listing not found or unavailable");
    if (listing.owner_user_id === buyerId) throw new AppError(400, "Cannot buy your own listing");

    // Create transaction
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .insert({
        listing_id: listingId,
        buyer_id: buyerId,
        seller_id: listing.owner_user_id,
        status: "pending"
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

    // Update transaction status
    const { error: updateError } = await supabaseAdmin
      .from("transactions")
      .update({ status: action })
      .eq("id", transactionId);
    if (updateError) throw updateError;

    // If approved, mark listing as sold
    if (action === "approved") {
      await supabaseAdmin
        .from("listings")
        .update({ status: "sold" })
        .eq("id", txn.listing_id);
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

    let query = supabaseAdmin.from('transactions').select('id, listing_id, buyer_id, seller_id, status, created_at');

    if (role === 'seller') query = query.eq('seller_id', userId);
    else if (role === 'buyer') query = query.eq('buyer_id', userId);
    else query = query.or(`seller_id.eq.${userId},buyer_id.eq.${userId}`);

    if (status) query = query.eq('status', String(status));

    // apply ordering and range for pagination
    const start = offset;
    const end = offset + limit - 1;
    const { data, error } = await query.order('created_at', { ascending: false }).range(start, end);
    if (error) throw error;
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
};
