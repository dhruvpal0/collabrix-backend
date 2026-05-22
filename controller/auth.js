import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import 'dotenv/config'
import pkg from '@prisma/client'

const { PrismaClient } = pkg

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const router = Router()


// ── Signup ──
router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body

  if (!email || !password || !name)
    return res.status(400).json({ error: 'Sab fields required hain' })

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing)
      return res.status(400).json({ error: 'Email already registered hai' })

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name }
    })

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name }
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── Login ──
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password)
    return res.status(400).json({ error: 'Email aur password required hai' })

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user)
      return res.status(400).json({ error: 'Email registered nahi hai' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid)
      return res.status(400).json({ error: 'Password galat hai' })

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name }
    })

  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── Get my rooms ──
router.get('/rooms', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Login karo pehle' })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const rooms = await prisma.room.findMany({
      where: { ownerId: decoded.userId },
      orderBy: { lastUsed: 'desc' }
    })
    res.json(rooms)
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

// ── Save room ──
router.post('/rooms', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Login karo pehle' })

  const { roomId, name } = req.body

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const room = await prisma.room.upsert({
      where: { roomId },
      update: { lastUsed: new Date(), name },
      create: { roomId, name, ownerId: decoded.userId }
    })

    res.json(room)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router