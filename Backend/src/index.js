import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const { default: connectDB } = await import("./db/index.js");
const { app } = await import("./app.js");

connectDB()
.then(()=>{
    const PORT = process.env.PORT || 8000;
    
    app.listen(PORT, '0.0.0.0', ()=>{
        console.log(`Server is running at port ${PORT}`);
    })
})
.catch((err)=>{
    console.log("MONGO db connection failed !! ", err);
})
