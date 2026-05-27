import mongoose from 'mongoose';
import {DB_NAME} from '../constant.js';

const buildMongoUri = () => {
    const baseUri = process.env.MONGODB_URI;

    if (!baseUri) {
        throw new Error("MONGODB_URI is missing in Backend/.env");
    }

    const [uriWithoutQuery, queryString] = baseUri.split("?");
    const alreadyHasDatabase = /^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]+/.test(uriWithoutQuery);

    if (alreadyHasDatabase) {
        return baseUri;
    }

    const normalizedUri = uriWithoutQuery.replace(/\/$/, "");
    return `${normalizedUri}/${DB_NAME}${queryString ? `?${queryString}` : ""}`;
};

const connectDB= async()=>{
    try{
        const connectionInstance= await mongoose.connect(buildMongoUri());
        console.log(`\n MongoDB connected !! DB Host: ${connectionInstance.connection.host}`);
      
        
    }
    catch(error){
        console.log("MONGODB connection error ", error);
        process.exit(1);
    }
}

export default connectDB;
