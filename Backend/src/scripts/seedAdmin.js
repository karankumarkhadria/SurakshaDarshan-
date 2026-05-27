import dotenv from "dotenv";
import connectDB from "../db/index.js";
import { Admin } from "../models/admin.models.js";

dotenv.config({ path: "./.env" });

const requiredEnv = ["ADMIN_CONTACT_NO", "ADMIN_TEMPLE_ID", "ADMIN_PASSWORD"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(`Missing required env values: ${missingEnv.join(", ")}`);
  process.exit(1);
}

await connectDB();

const admin = await Admin.findOneAndUpdate(
  { temple_id: process.env.ADMIN_TEMPLE_ID },
  {
    contactNo: process.env.ADMIN_CONTACT_NO,
    temple_id: process.env.ADMIN_TEMPLE_ID,
    password: process.env.ADMIN_PASSWORD,
  },
  { new: true, upsert: true, setDefaultsOnInsert: true }
).select("-password");

console.log("Admin ready:", admin);
process.exit(0);
