/**
 * TicTacToe Game - Two player game
 */

const TicTacToe = require('../../utils/tictactoe');

// Store games globally
const games = {};

module.exports = {
  games, // Export for handler access
  name: 'tictactoe',
  aliases: ['ttt', 'xo'],
  category: 'fun',
  description: 'Play TicTacToe with another player - Type .ttt to start or join a game',
  usage: '.ttt [room name]',
  
  async execute(sock, msg, args, extra) {
    try {
      const sender = extra.sender;
      const from = extra.from;
      const text = args.join(' ').trim();
      
      // Check if player is already in a game
      const existingRoom = Object.values(games).find(room => 
        room.id.startsWith('tictactoe') && 
        [room.game.playerX, room.game.playerO].includes(sender)
      );
      
      if (existingRoom && existingRoom.state === 'PLAYING') {
        await extra.reply('❌ You are still in a game. Type *surrender* to quit.');
        return;
      }
      
      // Look for existing waiting room
      let room = Object.values(games).find(room => 
        room.state === 'WAITING' && 
        room.id.startsWith('tictactoe') &&
        (text ? room.name === text : !room.name)
      );
      
      if (room) {
        // Join existing room
        room.o = from;
        room.game.playerO = sender;
        room.state = 'PLAYING';
        
        const arr = room.game.render().map(v => ({
          'X': '❎',
          'O': '⭕',
          '1': '1️⃣',
          '2': '2️⃣',
          '3': '3️⃣',
          '4': '4️⃣',
          '5': '5️⃣',
          '6': '6️⃣',
          '7': '7️⃣',
          '8': '8️⃣',
          '9': '9️⃣',
        }[v]));
        
        const str = `
🎮 *TicTacToe Game Started!*

Waiting for @${room.game.currentTurn.split('@')[0]} to play...

${arr.slice(0, 3).join('')}
${arr.slice(3, 6).join('')}
${arr.slice(6).join('')}

▢ *Room ID:* ${room.id}
▢ *Rules:*
• Make 3 rows of symbols vertically, horizontally or diagonally to win
• Type a number (1-9) to place your symbol
• Type *surrender* to give up
`;
        
        await sock.sendMessage(from, { 
          text: str,
          mentions: [room.game.currentTurn, room.game.playerX, room.game.playerO]
        });
        
      } else {
        // Create new room
        room = {
          id: 'tictactoe-' + (+new Date),
          x: from,
          o: '',
          game: new TicTacToe(sender, 'o'),
          state: 'WAITING'
        };
        
        if (text) room.name = text;
        
        await sock.sendMessage(from, { 
          text: `⏳ *Waiting for opponent*\nType *.ttt ${text || ''}* to join!`
        });
        
        games[room.id] = room;
      }
      
    } catch (error) {
      console.error('Error in tictactoe command:', error);
      await extra.reply('❌ Error starting game. Please try again.');
    }
  },
};

// Handle game moves (called from handler)
async function handleTicTacToeMove(sock, msg, extra) {
  try {
    const sender = extra.sender;
    const from = extra.from;
    const text = msg.message?.conversation || 
                 msg.message?.extendedTextMessage?.text || 
                 '';
    
    // Find player's game
    const room = Object.values(games).find(room => 
      room.id.startsWith('tictactoe') && 
      [room.game.playerX, room.game.playerO].includes(sender) && 
      room.state === 'PLAYING'
    );
    
    if (!room) return false;
    
    const isSurrender = /^(surrender|give up)$/i.test(text);
    
    if (!isSurrender && !/^[1-9]$/.test(text)) return false;
    
    // Allow surrender at any time, not just during player's turn
    if (sender !== room.game.currentTurn && !isSurrender) {
      await sock.sendMessage(from, { 
        text: '❌ Not your turn!' 
      });
      return true;
    }
    
    let ok = isSurrender ? true : room.game.turn(
      sender === room.game.playerO,
      parseInt(text) - 1
    );
    
    if (!ok) {
      await sock.sendMessage(from, { 
        text: '❌ Invalid move! That position is already taken.' 
      });
      return true;
    }
    
    let winner = room.game.winner;
    let isTie = room.game.turns === 9 && !winner;
    
    const arr = room.game.render().map(v => ({
      'X': '❎',
      'O': '⭕',
      '1': '1️⃣',
      '2': '2️⃣',
      '3': '3️⃣',
      '4': '4️⃣',
      '5': '5️⃣',
      '6': '6️⃣',
      '7': '7️⃣',
      '8': '8️⃣',
      '9': '9️⃣',
    }[v]));
    
    if (isSurrender) {
      // Set the winner to the opponent of the surrendering player
      winner = sender === room.game.playerX ? room.game.playerO : room.game.playerX;
      
      // Send a surrender message
      await sock.sendMessage(from, { 
        text: `🏳️ @${sender.split('@')[0]} has surrendered! @${winner.split('@')[0]} wins the game!`,
        mentions: [sender, winner]
      });
      
      // Delete the game immediately after surrender
      delete games[room.id];
      return true;
    }
    
    let gameStatus;
    if (winner) {
      gameStatus = `🎉 @${winner.split('@')[0]} wins the game!`;
    } else if (isTie) {
      gameStatus = `🤝 Game ended in a draw!`;
    } else {
      gameStatus = `🎲 Turn: @${room.game.currentTurn.split('@')[0]} (${sender === room.game.playerX ? '❎' : '⭕'})`;
    }
    
    const str = `
🎮 *TicTacToe Game*

${gameStatus}

${arr.slice(0, 3).join('')}
${arr.slice(3, 6).join('')}
${arr.slice(6).join('')}

▢ Player ❎: @${room.game.playerX.split('@')[0]}
▢ Player ⭕: @${room.game.playerO.split('@')[0]}

${!winner && !isTie ? '• Type a number (1-9) to make your move\n• Type *surrender* to give up' : ''}
`;
    
    const mentions = [
      room.game.playerX, 
      room.game.playerO,
      ...(winner ? [winner] : [room.game.currentTurn])
    ];
    
    await sock.sendMessage(room.x, { 
      text: str,
      mentions: mentions
    });
    
    if (room.x !== room.o) {
      await sock.sendMessage(room.o, { 
        text: str,
        mentions: mentions
      });
    }
    
    if (winner || isTie) {
      delete games[room.id];
    }
    
    return true;
  } catch (error) {
    console.error('Error in tictactoe move:', error);
    return false;
  }
}

module.exports.handleTicTacToeMove = handleTicTacToeMove;

