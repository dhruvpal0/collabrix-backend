import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { exec } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import 'dotenv/config'
import authRouter from './controller/auth.js'

const app = express()

const CLIENT_URLS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://codemesh1.netlify.app',
  'https://www.codemesh1.netlify.app',
]

app.use(cors({
  origin: CLIENT_URLS,
  credentials: true
}))
app.use(express.json())

const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URLS,
    credentials: true
  }
})

// const io = new Server(httpServer, {
//   cors: { origin: CLIENT_URL }
// })

// ── Health check — Render ke liye zaroori ──
app.get('/', (req, res) => res.json({ status: 'CodeTogether server running' }))

// ── Code execution ──
app.post('/execute', (req, res) => {
  const { code, language } = req.body

  const config = {
    javascript: {
      ext: 'js',
      cmd: 'node'
    },
    python: {
      ext: 'py',
      cmd: 'python'
    }
  }[language]

  if (!config) {
    return res.json({
      output: `❌ ${language} not supported`
    })
  }

  const filename = join(
    tmpdir(),
    `code_${Date.now()}.${config.ext}`
  )

  try {
    writeFileSync(filename, code)

    exec(
      `${config.cmd} "${filename}"`,
      { timeout: 5000 },
      (error, stdout, stderr) => {

        try {
          unlinkSync(filename)
        } catch {}

        if (error) {
          return res.json({
            output: error.message
          })
        }

        if (stderr) {
          return res.json({
            output: stderr
          })
        }

        res.json({
          output: stdout || '✅ Code executed successfully'
        })
      }
    )
  } catch (err) {
    res.json({
      output: err.message
    })
  }
})

// ── Socket.io ──
const roomUsers = {}

io.on('connection', (socket) => {
  console.log('✅ Connected:', socket.id)

  socket.on('join-room', (roomId) => {
    socket.join(roomId)
    socket.currentRoom = roomId
  })

  socket.on('user-joined', ({ room, name, color }) => {
    if (!roomUsers[room]) roomUsers[room] = {}
    roomUsers[room][socket.id] = { name, color }
    io.to(room).emit('users-update', Object.values(roomUsers[room]))
  })

  socket.on('code-change', ({ room, code }) => {
    socket.to(room).emit('code-update', code)
  })

  socket.on('disconnect', () => {
    const room = socket.currentRoom
    if (room && roomUsers[room]) {
      delete roomUsers[room][socket.id]
      io.to(room).emit('users-update', Object.values(roomUsers[room]))
    }
    console.log('❌ Disconnected:', socket.id)
  })
})

app.use('/auth', authRouter)

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))