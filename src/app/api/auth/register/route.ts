import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, phone, password, storeName } = body;

    if (!name || !email || !phone || !password || !storeName) {
      return NextResponse.json(
        { error: "Todos os campos são obrigatórios" },
        { status: 400 }
      );
    }

    const slug = storeName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const supabase = await createServerSupabase();

    // Verificar se o slug já existe
    const { data: existingStore } = await supabase
      .from("stores")
      .select("id")
      .eq("slug", slug)
      .single();

    if (existingStore) {
      return NextResponse.json(
        { error: "Este nome de loja já está em uso. Tente outro nome." },
        { status: 400 }
      );
    }

    // Criar usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone },
      },
    });

    if (authError) {
      if (authError.message.includes("already registered")) {
        return NextResponse.json(
          { error: "Este e-mail já está cadastrado" },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: "Erro ao criar conta" },
        { status: 500 }
      );
    }

    // Criar a loja
    const { error: storeError } = await supabase.from("stores").insert({
      user_id: authData.user.id,
      name: storeName,
      slug,
      phone,
    });

    if (storeError) {
      return NextResponse.json(
        { error: "Erro ao criar loja: " + storeError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      user: {
        id: authData.user.id,
        name,
        email,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
