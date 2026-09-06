/**
 * Prime AI Auto Reply Command
 */

const { load, save } = require('../../utils/primeAI');

module.exports = {
    name: 'sahil',
    aliases: ['primeai', 'aireply'],
    category: 'owner',
    description: 'Enable or disable Prime AI Auto Reply',
    ownerOnly: true,
    usage: '.sahil <on/off/status/reload/set>',

    async execute(sock, msg, args, extra) {

        const db = load();
        const option = String(args[0] || '').toLowerCase();

        if (!option) {
            return extra.reply(
                `🤖 *Prime AI*

Usage:
.sahil on
.sahil off
.sahil status`
            );
        }

        if (option === 'on') {
            db.enabled = true;
            db.language = 'english';
            save(db);

            return extra.reply(
                `✅ PrimeSAAI assistant Auto Reply Enabled

The PrimeSAAI assistant will now automatically reply to messages in English. It understands isiZulu but will reply in English. If you write in isiZulu the assistant will note that and ask you to continue in full English.`
            );
        }

        if (option === 'off') {
            db.enabled = false;
            save(db);

            return extra.reply(
                `❌ Prime AI Auto Reply Disabled`
            );
        }

        if (option === 'status') {

            return extra.reply(
                `🤖 PrimeSAAI assistant Status

Status : ${db.enabled ? "🟢 ON" : "🔴 OFF"}

Language : English only (understands isiZulu but replies in English)

Provider : ${db.provider}`
            );
        }

        return extra.reply(
            '❌ Invalid option.\n\nUse:\n.sahil on\n.sahil off\n.sahil status'
        );

    }
};