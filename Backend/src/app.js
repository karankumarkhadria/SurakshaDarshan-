// 

import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}))

app.use(express.json({limit: "16kb"}))
app.use(express.urlencoded({extended: true, limit: "16kb"}))
app.use(express.static("public"))
app.use(cookieParser())

// API Routes
import userRouter from "./routes/user.routes.js"
app.use("/api/v1/users", userRouter)

import bookingRouter from "./routes/booking.routes.js"
app.use("/api/v1/bookings", bookingRouter)

import adminRouter from "./routes/admin.routes.js"
app.use("/api/v1/admin", adminRouter)

// Serve React Frontend in Production
if (process.env.NODE_ENV === 'production') {
    const frontendPath = path.join(__dirname, '../../Frontend/build')
    app.use(express.static(frontendPath))
    
    app.get('*', (req, res) => {
        res.sendFile(path.join(frontendPath, 'index.html'))
    })
}

export { app }