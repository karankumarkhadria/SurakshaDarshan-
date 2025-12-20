
import { Router } from "express";
import { 
    registerBooking, 
    getBookingHistory, 
    getSlotAvailability,
    initializeSlots,
    cancelBooking
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middlewares.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router()


router.route("/booking").post(verifyJWT, upload.none(), registerBooking)
router.route("/booking-history").get(verifyJWT, getBookingHistory)
router.route("/cancel-booking").post(verifyJWT,upload.none(),cancelBooking)

router.route("/slot-availability").get(getSlotAvailability)
router.route("/initialize-slots").post(upload.none(), initializeSlots) 

export default router