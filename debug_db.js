
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Manual env parsing
try {
    const envPath = path.resolve(__dirname, '.env.local');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf8');
        envConfig.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                process.env[key.trim()] = value.trim();
            }
        });
    }
} catch (e) {
    console.error("Could not read .env.local", e);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    console.log("Testing Supabase Connection...");

    // 1. Test product_intent_scores
    const { data, error } = await supabase
        .from('product_intent_scores')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error fetching product_intent_scores:", error);
    } else {
        console.log("Success! Found scores:", data.length);
        if (data.length > 0) console.log(JSON.stringify(data[0], null, 2));
    }

    // 2. Test products_raw (if relation exists)
    // Checking accessing directly first
    const { data: prodData, error: prodError } = await supabase
        .from('products_raw')
        .select('*')
        .limit(1);

    if (prodError) {
        console.error("Error fetching products_raw:", prodError);
    } else {
        console.log("Success! Found products:", prodData.length);
        if (prodData.length > 0) console.log(JSON.stringify(prodData[0], null, 2));
    }
}

test();
