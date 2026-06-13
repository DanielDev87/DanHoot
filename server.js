const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Fallback redirects to index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// In-memory game state storage
const activeGames = {};

/**
 * Helper to generate a unique 6-digit room PIN code
 */
function generateRoomCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (activeGames[code]);
  return code;
}

/**
 * Returns player list sorted by score desc
 */
function getLeaderboard(game) {
  return Object.values(game.players)
    .map(p => ({ nickname: p.nickname, score: p.score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Returns rank of a player (1-indexed)
 */
function getPlayerRank(game, socketId) {
  const sorted = Object.keys(game.players)
    .map(id => ({ id, score: game.players[id].score }))
    .sort((a, b) => b.score - a.score);
  return sorted.findIndex(p => p.id === socketId) + 1;
}

/**
 * Ends a question timer and distributes answers results
 */
function endQuestion(roomCode) {
  const game = activeGames[roomCode];
  if (!game || game.state !== 'playing') return;

  if (game.questionTimer) {
    clearTimeout(game.questionTimer);
    game.questionTimer = null;
  }

  const question = game.questions[game.currentQuestionIndex];
  const totalPlayers = Object.keys(game.players).length;

  // Compile leaderboard
  const currentLeaderboard = getLeaderboard(game);

  // Send stats to Host
  io.to(game.hostSocketId).emit('questionResults', {
    correctOptionIndex: question.correct,
    distribution: game.responses,
    leaderboard: currentLeaderboard.slice(0, 5) // Send top 5 to show on host dashboard
  });

  // Send individualized feedback to each player
  Object.keys(game.players).forEach(socketId => {
    const player = game.players[socketId];
    const isCorrect = (player.lastAnswer === question.correct);
    
    io.to(socketId).emit('questionFeedback', {
      isCorrect,
      correctOptionIndex: question.correct,
      pointsEarned: player.lastPointsEarned || 0,
      totalScore: player.score,
      rank: getPlayerRank(game, socketId),
      totalPlayers
    });
  });
}

// Websocket logic
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 1. Host creates a game
  socket.on('createGame', async (data) => {
    const { title, questions } = data;
    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      socket.emit('error', { message: 'El quiz debe tener un título y al menos una pregunta.' });
      return;
    }

    const roomCode = generateRoomCode();
    
    // Construct absolute join URL based on handshake headers
    const host = socket.handshake.headers.host || 'localhost:3000';
    // Support HTTPS protocol checks or fallback to HTTP
    const protocol = socket.handshake.headers['x-forwarded-proto'] || 'http';
    const joinUrl = `${protocol}://${host}/?code=${roomCode}`;

    try {
      const qrCodeDataUrl = await QRCode.toDataURL(joinUrl);
      
      activeGames[roomCode] = {
        hostSocketId: socket.id,
        title,
        questions: questions.map(q => ({
          text: q.text,
          options: q.options,
          correct: parseInt(q.correct),
          timeLimit: parseInt(q.timeLimit) || 20
        })),
        currentQuestionIndex: -1,
        state: 'lobby',
        players: {},
        responses: { 0: 0, 1: 0, 2: 0, 3: 0 },
        responsesReceived: 0,
        questionTimer: null
      };

      socket.join(roomCode);
      socket.emit('gameCreated', { roomCode, qrCodeDataUrl });
      console.log(`Game created: Code ${roomCode}`);
    } catch (err) {
      console.error('Error generating QR code:', err);
      socket.emit('error', { message: 'Error al generar código QR de sala.' });
    }
  });

  // 2. Player joins game
  socket.on('joinGame', (data) => {
    const { roomCode, nickname } = data;
    
    if (!roomCode || !nickname) {
      socket.emit('error', { message: 'PIN de sala y nombre de usuario son obligatorios.' });
      return;
    }

    const game = activeGames[roomCode];
    
    if (!game) {
      socket.emit('error', { message: 'La sala especificada no existe.' });
      return;
    }

    if (game.state !== 'lobby') {
      socket.emit('error', { message: 'La partida ya ha comenzado.' });
      return;
    }

    // Check if nickname already taken
    const nameExists = Object.values(game.players).some(
      p => p.nickname.toLowerCase() === nickname.toLowerCase()
    );

    if (nameExists) {
      socket.emit('error', { message: 'El nombre de usuario ya está en uso.' });
      return;
    }

    // Add player
    game.players[socket.id] = {
      socketId: socket.id,
      nickname,
      score: 0,
      lastAnswer: null,
      lastPointsEarned: 0
    };

    socket.join(roomCode);
    socket.emit('joinSuccess', { roomCode, nickname });

    // Notify Host and players in room about lobby list update
    const playersList = Object.values(game.players).map(p => ({ nickname: p.nickname, score: p.score }));
    io.to(game.hostSocketId).emit('updateLobby', { players: playersList });
    console.log(`Player ${nickname} joined room ${roomCode}`);
  });

  // 3. Host starts game
  socket.on('startGame', (data) => {
    const { roomCode } = data;
    const game = activeGames[roomCode];

    if (!game || game.hostSocketId !== socket.id) {
      socket.emit('error', { message: 'No estás autorizado para iniciar esta partida.' });
      return;
    }

    if (Object.keys(game.players).length === 0) {
      socket.emit('error', { message: 'Debe haber al menos un jugador conectado para iniciar.' });
      return;
    }

    game.state = 'playing';
    game.currentQuestionIndex = 0;
    
    io.to(roomCode).emit('gameStarted');
    sendQuestion(roomCode);
  });

  // Helper function to transmit question information
  function sendQuestion(roomCode) {
    const game = activeGames[roomCode];
    if (!game) return;

    game.responsesReceived = 0;
    game.responses = { 0: 0, 1: 0, 2: 0, 3: 0 };
    
    // Clear last choices
    Object.keys(game.players).forEach(id => {
      game.players[id].lastAnswer = null;
      game.players[id].lastPointsEarned = 0;
    });

    const question = game.questions[game.currentQuestionIndex];
    game.questionStartTime = Date.now();

    // Broadcast question details to players and host (omitting correct choice!)
    io.to(roomCode).emit('sendQuestion', {
      questionIndex: game.currentQuestionIndex,
      totalQuestions: game.questions.length,
      questionText: question.text,
      options: question.options,
      timeLimit: question.timeLimit
    });

    // Start server side timer
    game.questionTimer = setTimeout(() => {
      endQuestion(roomCode);
    }, question.timeLimit * 1000);
  }

  // 4. Player submits answer
  socket.on('submitAnswer', (data) => {
    const { roomCode, answerIndex, timeRemainingMs } = data;
    const game = activeGames[roomCode];

    if (!game || game.state !== 'playing') return;

    const player = game.players[socket.id];
    if (!player) return;

    // Check if player has already answered
    if (player.lastAnswer !== null) return;

    const currentQuestion = game.questions[game.currentQuestionIndex];
    const optionIdx = parseInt(answerIndex);

    player.lastAnswer = optionIdx;
    
    // Increment distribution stats
    if (optionIdx >= 0 && optionIdx <= 3) {
      game.responses[optionIdx] = (game.responses[optionIdx] || 0) + 1;
    }

    // Score calculations: base 1000, subtracting time elapsed
    if (optionIdx === currentQuestion.correct) {
      const timeLimitMs = currentQuestion.timeLimit * 1000;
      
      // Calculate active elapsed time
      const timeElapsedMs = Math.max(0, timeLimitMs - timeRemainingMs);
      
      // Factor represents decay per millisecond. Maximum reduction is 500 points
      const factor = 500 / timeLimitMs;
      const points = Math.max(500, Math.round(1000 - timeElapsedMs * factor));
      
      player.lastPointsEarned = points;
      player.score += points;
    } else {
      player.lastPointsEarned = 0;
    }

    game.responsesReceived++;

    // Notify Host of incremental answered count
    io.to(game.hostSocketId).emit('updateStats', {
      answeredCount: game.responsesReceived,
      totalPlayers: Object.keys(game.players).length
    });

    // If all players responded, end the question countdown immediately
    if (game.responsesReceived === Object.keys(game.players).length) {
      endQuestion(roomCode);
    }
  });

  // 5. Host advances to next question
  socket.on('nextQuestion', (data) => {
    const { roomCode } = data;
    const game = activeGames[roomCode];

    if (!game || game.hostSocketId !== socket.id) return;

    game.currentQuestionIndex++;

    if (game.currentQuestionIndex < game.questions.length) {
      sendQuestion(roomCode);
    } else {
      // Game ended - compile final leaderboards and emit endGame
      game.state = 'ended';
      const leaderboard = getLeaderboard(game);
      
      io.to(roomCode).emit('endGame', {
        podium: leaderboard.slice(0, 3),
        fullLeaderboard: leaderboard
      });
      console.log(`Game ended: Room ${roomCode}`);
    }
  });

  // 6. Host requests reset/play again
  socket.on('restartGame', (data) => {
    const { roomCode } = data;
    const game = activeGames[roomCode];

    if (!game || game.hostSocketId !== socket.id) return;

    // Reset scores & status
    game.state = 'lobby';
    game.currentQuestionIndex = -1;
    game.responsesReceived = 0;
    game.responses = { 0: 0, 1: 0, 2: 0, 3: 0 };
    
    Object.keys(game.players).forEach(id => {
      game.players[id].score = 0;
      game.players[id].lastAnswer = null;
      game.players[id].lastPointsEarned = 0;
    });

    io.to(roomCode).emit('gameRestarted');
    
    // Broadcast refreshed player list to Host
    const playersList = Object.values(game.players).map(p => ({ nickname: p.nickname, score: p.score }));
    socket.emit('updateLobby', { players: playersList });
    console.log(`Game restarted: Room ${roomCode}`);
  });

  // 7. Client disconnection
  socket.on('disconnect', () => {
    // Check if the disconnectee is a Host
    Object.keys(activeGames).forEach(roomCode => {
      const game = activeGames[roomCode];
      
      if (game.hostSocketId === socket.id) {
        // Clear active timers
        if (game.questionTimer) {
          clearTimeout(game.questionTimer);
        }
        // Notify players host left
        io.to(roomCode).emit('error', { message: 'El anfitrión se ha desconectado. La partida se ha cancelado.' });
        delete activeGames[roomCode];
        console.log(`Room deleted (Host disconnected): ${roomCode}`);
      } else if (game.players[socket.id]) {
        // Player disconnected
        const playerNickname = game.players[socket.id].nickname;
        delete game.players[socket.id];
        console.log(`Player ${playerNickname} disconnected from room ${roomCode}`);

        if (game.state === 'lobby') {
          const playersList = Object.values(game.players).map(p => ({ nickname: p.nickname, score: p.score }));
          io.to(game.hostSocketId).emit('updateLobby', { players: playersList });
        } else if (game.state === 'playing') {
          // If in progress, verify if we were waiting on their answer
          io.to(game.hostSocketId).emit('updateStats', {
            answeredCount: game.responsesReceived,
            totalPlayers: Object.keys(game.players).length
          });

          // Check if we need to auto end question
          if (Object.keys(game.players).length > 0 && game.responsesReceived >= Object.keys(game.players).length) {
            endQuestion(roomCode);
          } else if (Object.keys(game.players).length === 0) {
            // No players left, clear timer
            if (game.questionTimer) {
              clearTimeout(game.questionTimer);
            }
          }
        }
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`DanHoot server running on http://localhost:${PORT}`);
});
