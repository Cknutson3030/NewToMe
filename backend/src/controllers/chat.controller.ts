import { Request, RequestHandler } from "express";
import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../errors/app-error";

interface AuthenticatedRequest extends Request {
  user?: { id: string };
  accessToken?: string;
}

const getAuthUserId = (req: AuthenticatedRequest): string => {
  if (!req.user?.id) throw new AppError(401, "Authentication required");
  return req.user.id;
};

// POST /conversations
// Body: { listing_id }
// Creates or returns the existing conversation between the authenticated buyer and the listing's seller.
export const getOrCreateConversation: RequestHandler = async (req, res, next) => {
  try {
    const buyerId = getAuthUserId(req as AuthenticatedRequest);
    const { listing_id } = req.body as { listing_id?: string };

    if (!listing_id) throw new AppError(400, "listing_id is required");

    // Fetch the listing to find the seller
    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id, owner_user_id, is_deleted")
      .eq("id", listing_id)
      .single();

    if (listingError || !listing) throw new AppError(404, "Listing not found");
    if (listing.is_deleted) throw new AppError(400, "Listing is no longer available");

    const sellerId = listing.owner_user_id as string;
    if (sellerId === buyerId) throw new AppError(400, "You cannot message yourself about your own listing");

    // Upsert: return existing or create new
    const { data: existing } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("listing_id", listing_id)
      .eq("buyer_user_id", buyerId)
      .maybeSingle();

    if (existing) {
      res.status(200).json({ data: existing });
      return;
    }

    const { data: created, error: createError } = await supabaseAdmin
      .from("conversations")
      .insert({ listing_id, buyer_user_id: buyerId, seller_user_id: sellerId })
      .select("*")
      .single();

    if (createError) throw createError;

    res.status(201).json({ data: created });
  } catch (error) {
    next(error);
  }
};

// GET /conversations
// Returns all conversations where the authenticated user is buyer or seller,
// including the listing title and the last message.
export const listConversations: RequestHandler = async (req, res, next) => {
  try {
    const userId = getAuthUserId(req as AuthenticatedRequest);

    const { data, error } = await supabaseAdmin
      .from("conversations")
      .select(`
        id,
        listing_id,
        buyer_user_id,
        seller_user_id,
        buyer_last_read_at,
        seller_last_read_at,
        created_at,
        updated_at,
        listings ( id, title ),
        messages ( id, sender_user_id, body, created_at )
      `)
      .or(`buyer_user_id.eq.${userId},seller_user_id.eq.${userId}`)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    // Attach only the latest message and compute has_unread for each conversation
    const result = (data ?? []).map((conv: any) => {
      const msgs: any[] = conv.messages ?? [];
      const lastMessage = msgs.sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0] ?? null;

      const isBuyer = conv.buyer_user_id === userId;
      const lastReadAt = isBuyer ? conv.buyer_last_read_at : conv.seller_last_read_at;
      const has_unread =
        lastMessage !== null &&
        lastMessage.sender_user_id !== userId &&
        (lastReadAt === null || new Date(lastMessage.created_at) > new Date(lastReadAt));

      return { ...conv, messages: undefined, last_message: lastMessage, has_unread };
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
};

// GET /conversations/:id/messages
// Returns all messages in a conversation (oldest first). User must be a participant.
export const getMessages: RequestHandler = async (req, res, next) => {
  try {
    const userId = getAuthUserId(req as AuthenticatedRequest);
    const conversationId = req.params.id;

    // Verify the user is a participant
    const { data: conv, error: convError } = await supabaseAdmin
      .from("conversations")
      .select("id, buyer_user_id, seller_user_id")
      .eq("id", conversationId)
      .single();

    if (convError || !conv) throw new AppError(404, "Conversation not found");
    if (conv.buyer_user_id !== userId && conv.seller_user_id !== userId) {
      throw new AppError(403, "Not a participant in this conversation");
    }

    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);

    const { data: messages, error } = await supabaseAdmin
      .from("messages")
      .select("id, conversation_id, sender_user_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Mark conversation as read for this user
    const readField = conv.buyer_user_id === userId ? "buyer_last_read_at" : "seller_last_read_at";
    await supabaseAdmin
      .from("conversations")
      .update({ [readField]: new Date().toISOString() })
      .eq("id", conversationId);

    res.status(200).json({ data: messages ?? [], meta: { limit, offset, count: messages?.length ?? 0 } });
  } catch (error) {
    next(error);
  }
};

// POST /conversations/:id/messages
// Body: { body }
// Sends a message. User must be a participant.
export const sendMessage: RequestHandler = async (req, res, next) => {
  try {
    const userId = getAuthUserId(req as AuthenticatedRequest);
    const conversationId = req.params.id;
    const { body } = req.body as { body?: string };

    if (!body || body.trim().length === 0) throw new AppError(400, "Message body is required");
    if (body.length > 2000) throw new AppError(400, "Message is too long (max 2000 characters)");

    // Verify the user is a participant
    const { data: conv, error: convError } = await supabaseAdmin
      .from("conversations")
      .select("id, buyer_user_id, seller_user_id")
      .eq("id", conversationId)
      .single();

    if (convError || !conv) throw new AppError(404, "Conversation not found");
    if (conv.buyer_user_id !== userId && conv.seller_user_id !== userId) {
      throw new AppError(403, "Not a participant in this conversation");
    }

    const { data: message, error } = await supabaseAdmin
      .from("messages")
      .insert({ conversation_id: conversationId, sender_user_id: userId, body: body.trim() })
      .select("id, conversation_id, sender_user_id, body, created_at")
      .single();

    if (error) throw error;

    res.status(201).json({ data: message });
  } catch (error) {
    next(error);
  }
};
