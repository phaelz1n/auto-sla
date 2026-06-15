const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    const url = process.env.SUPABASE_URL.trim();
    const key = process.env.SUPABASE_KEY.trim();
    supabase = createClient(url, key);
}

module.exports = supabase;
