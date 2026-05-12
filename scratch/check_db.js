require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkData() {
    const { data, error } = await supabase.from('ff_orders')
        .select('*')
        .not('pin', 'is', null)
        .limit(5);
    
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Orders with pins found:', data.length);
        if (data.length > 0) {
            console.log('Sample order:', data[0]);
        }
    }
}

checkData();
