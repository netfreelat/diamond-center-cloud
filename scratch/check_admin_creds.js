require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkAndFix() {
    console.log('=== Verificando credenciales admin en Supabase ===\n');
    
    // Verificar sin columna admin_session_token
    const { data, error } = await supabase
        .from('ff_settings')
        .select('id, admin_username, admin_password')
        .eq('id', 1)
        .single();
    
    if (error) {
        console.error('❌ Error:', error.message);
    } else {
        console.log('✅ Fila encontrada:');
        console.log('   Usuario:', data.admin_username || '(vacío)');
        console.log('   Contraseña:', data.admin_password || '(vacío)');
    }

    console.log('\n=== Verificando si la columna admin_session_token existe ===');
    const { error: colError } = await supabase
        .from('ff_settings')
        .select('admin_session_token')
        .eq('id', 1)
        .single();
    
    if (colError && colError.code === '42703') {
        console.log('❌ COLUMNA admin_session_token NO EXISTE');
        console.log('\n⚠️  DEBES ejecutar en Supabase SQL Editor:');
        console.log('ALTER TABLE ff_settings ADD COLUMN IF NOT EXISTS admin_session_token TEXT;');
        console.log('\nEsto es CRÍTICO para que el login funcione correctamente.');
    } else {
        console.log('✅ Columna admin_session_token OK');
    }
}

checkAndFix().catch(console.error);
