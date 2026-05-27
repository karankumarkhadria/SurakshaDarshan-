// 

import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)

app.use(cors({
    origin: allowedOrigins,
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

app.get("/api/v1/health", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "SurakshaDarshan backend is running"
    })
})

// Serve React Frontend in Production
if (process.env.NODE_ENV === 'production') {
    const frontendPath = path.join(__dirname, '../../Frontend/dist')
    app.use(express.static(frontendPath))
    
app.use((req, res) => {
 res.sendFile(
  path.join(frontendPath, 'index.html')
)

})


}

app.use((err, _req, res, _next) => {
    const statusCode = err.statuscode || err.statusCode || 500
    res.status(statusCode).json({
        statuscode: statusCode,
        success: false,
        message: err.message || "Internal server error",
        errors: err.errors || []
    })
})

export { app }
