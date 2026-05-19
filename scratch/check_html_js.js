const fs = require('fs');
const path = require('path');

try {
    const htmlPath = path.join(__dirname, '..', 'admin.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Extract everything between <script> and </script> (the main one near the end)
    const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
    let match;
    let scripts = [];
    while ((match = scriptRegex.exec(htmlContent)) !== null) {
        scripts.push(match[1]);
    }
    
    console.log(`Found ${scripts.length} script blocks.`);
    
    // We want the last script block which contains the logic
    const lastScript = scripts[scripts.length - 1];
    
    // Write it to a temp js file
    const tempFile = path.join(__dirname, 'temp_admin_script.js');
    fs.writeFileSync(tempFile, lastScript, 'utf8');
    console.log(`Wrote last script to temp file. Checking syntax...`);
    
    const { execSync } = require('child_process');
    try {
        execSync(`node -c "${tempFile}"`, { stdio: 'inherit' });
        console.log('✅ Syntax is PERFECT!');
    } catch (err) {
        console.error('❌ Syntax Error found!');
    }
} catch (e) {
    console.error('Error running check:', e);
}
