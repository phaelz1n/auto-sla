require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const clientes = [
    "AIVA", "CONTROIL", "DARCY PACHECO", "DROGA RAIA", "FIBRAPLAC",
    "FM LOGISTIC", "FREESURF", "GEDORE", "HERC", "HERTZ", "HT MICRON",
    "ISLA", "MARCHER", "MUNDIAL", "NEXTEER", "PERTO", "PROMETEON",
    "REITER", "SHOPEE", "SHOPEE ESTEIO", "SHOPEE NOVA SANTA RITA",
    "TEGMA", "UNIQUE", "VIDA", "VIEMAR", "VIKINGS", "WEG", "ZAFFARI"
];

async function seed() {
    console.log("Checando tabela de clientes...");
    
    // Testa se a tabela existe
    const { error: testError } = await supabase.from('clientes').select('id').limit(1);
    if (testError) {
        console.error("ERRO: A tabela não existe. Você executou o database_setup.sql no Supabase?");
        console.error(testError);
        return;
    }

    console.log("Inserindo clientes...");
    for (const nome of clientes) {
        const { data, error } = await supabase.from('clientes').insert([{ nome }]).select();
        if (error) {
            if (error.code === '23505') { // Unique violation
                console.log(`Cliente ${nome} já existe. Pulando...`);
            } else {
                console.error(`Erro ao inserir ${nome}:`, error.message);
            }
        } else {
            console.log(`Cliente ${nome} inserido com sucesso!`);
        }
    }
    console.log("Processo finalizado.");
}

seed();
