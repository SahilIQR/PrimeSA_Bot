/**
 * TicTacToe Game Logic
 */

class TicTacToe {
  constructor(playerX, playerO) {
    this.playerX = playerX;
    this.playerO = playerO;
    this.board = Array(9).fill(null);
    this.currentTurn = playerX;
    this.turns = 0;
    this.winner = null;
  }

  turn(isO, index) {
    if (this.winner) return false;
    if (this.board[index]) return false;
    
    this.board[index] = isO ? 'O' : 'X';
    this.turns++;
    this.checkWinner();
    
    if (!this.winner && this.turns < 9) {
      this.currentTurn = isO ? this.playerX : this.playerO;
    }
    
    return true;
  }

  checkWinner() {
    const winConditions = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
      [0, 4, 8], [2, 4, 6]              // Diagonals
    ];

    for (const condition of winConditions) {
      const [a, b, c] = condition;
      if (this.board[a] && 
          this.board[a] === this.board[b] && 
          this.board[a] === this.board[c]) {
        this.winner = this.board[a] === 'X' ? this.playerX : this.playerO;
        return;
      }
    }
  }

  render() {
    return this.board.map((cell, index) => {
      if (cell) return cell;
      return (index + 1).toString();
    });
  }
}

module.exports = TicTacToe;

