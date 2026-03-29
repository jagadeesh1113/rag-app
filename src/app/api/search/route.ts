/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
);
const openai = new OpenAI();

// GET /api/search — return search history for the logged-in user
// When ?conversationId=<id> is provided, returns all messages for that conversation.
// Otherwise returns one summary item per conversation, ordered by most recent activity.
export async function GET(req: Request) {
  try {
    const supabaseServer = await createServerClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();

    if (!user) {
      return NextResponse.json({ history: [], messages: [] });
    }

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    // ── Fetch all messages for a specific conversation ──
    if (conversationId) {
      const { data, error } = await supabase
        .from("search_history")
        .select("id, query, answer, sources, searched_at, conversation_id")
        .eq("owner", user.id)
        .eq("conversation_id", conversationId)
        .order("searched_at", { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ messages: data || [] });
    }

    // ── Fetch all rows then group by conversation_id client-side ──
    const { data, error } = await supabase
      .from("search_history")
      .select("id, query, answer, sources, searched_at, conversation_id")
      .eq("owner", user.id)
      .order("searched_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];

    // Group rows by conversation_id, keeping the FIRST (most-recent) row as the
    // conversation summary (title = opening query, preview = latest answer).
    const seen = new Map<string, typeof rows[number]>();
    for (const row of rows) {
      const key = row.conversation_id ?? row.id; // fall back to row id for legacy rows
      if (!seen.has(key)) {
        // rows are ordered newest-first, so this is the latest message in the convo
        seen.set(key, row);
      } else {
        // Keep the earliest query as the conversation title
        const existing = seen.get(key)!;
        if (new Date(row.searched_at) < new Date(existing.searched_at)) {
          seen.set(key, { ...row, answer: existing.answer, searched_at: existing.searched_at });
        }
      }
    }

    const history = Array.from(seen.values()).sort(
      (a, b) => new Date(b.searched_at).getTime() - new Date(a.searched_at).getTime(),
    );

    return NextResponse.json({ history });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/search — run a RAG search and persist the result to history
export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    // Generate embedding for the user's query
    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });

    const supabaseServer = await createServerClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();

    // Find similar documents using vector similarity search
    const { data: results, error } = await supabase.rpc("match_documents", {
      query_embedding: JSON.stringify(emb.data[0].embedding),
      match_threshold: 0.0,
      match_count: 5,
      owner_id: user?.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Combine retrieved chunks into context
    const context = results?.map((r: any) => r.content).join("\n---\n") || "";

    // Generate answer using OpenAI with retrieved context
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. Use the provided context to answer questions. If the answer is not in the context, say you do not know.",
        },
        {
          role: "user",
          content: `Context: ${context}\n\nQuestion: ${query}`,
        },
      ],
    });

    const answer = completion.choices[0].message.content;

    // Persist to search_history (fire-and-forget — don't block the response)
    if (user) {
      supabase
        .from("search_history")
        .insert({
          query,
          answer,
          sources: results,
          owner: user.id,
          searched_at: new Date().toISOString(),
        })
        .then(({ error: insertError }) => {
          if (insertError) {
            console.warn(
              "[search_history] Failed to save:",
              insertError.message,
            );
          }
        });
    }

    return NextResponse.json({ answer, sources: results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
