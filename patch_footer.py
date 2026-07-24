#!/usr/bin/env python3
# patch_footer.py - Agrega nota de número guardado al mensaje de aprobación
import re

FILE = '/var/www/recargasney/server.js'

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

OLD = (
    r'msg += `\n\n📢 *Únete a nuestro canal de WhatsApp para promos:* \n'
    r'🔗 https://whatsapp.com/channel/0029Vb7Wf8M35fLnOvFiY01K\n\n'
    r'¡Gracias por confiar en *RECARGASNEY.COM*! 🎯🛡️`;'
)

NEW = (
    r'msg += `\n\n📱 *Guarda este número* para recibir tus notificaciones y'
    r' consultar precios enviando la palabra *PRECIO*:\n👉 *+58 412-349-1068*'
    r'\n\n📢 *Únete a nuestro canal de WhatsApp para promos:* \n'
    r'🔗 https://whatsapp.com/channel/0029Vb7Wf8M35fLnOvFiY01K\n\n'
    r'¡Gracias por confiar en *RECARGASNEY.COM*! 🎯🛡️`;'
)

if OLD in content:
    content = content.replace(OLD, NEW, 1)
    with open(FILE, 'w', encoding='utf-8') as f:
        f.write(content)
    print('✅ Parche aplicado correctamente.')
else:
    # Show what line 514 actually says
    lines = content.split('\n')
    print('❌ Texto no encontrado. Línea 514:')
    print(repr(lines[513]))
