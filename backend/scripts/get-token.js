"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
async function main() {
    const email = process.argv[2];
    const password = process.argv[3];
    if (!email || !password) {
        console.error("Usage: npx ts-node scripts/get-token.ts <email> <password>");
        process.exit(1);
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error)
        throw error;
    console.log(data.session?.access_token);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
