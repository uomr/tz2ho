import { Router, type IRouter } from "express";
import healthRouter from "./health";
import invoicesRouter from "./invoices";
import partsRouter from "./parts";
import statsRouter from "./stats";
import authRouter from "./auth";
import usersRouter from "./users";
import adminSettingsRouter from "./admin-settings";
import analyticsRouter from "./analytics";
import exportRouter from "./export";
import storageAdminRouter from "./storage-admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(adminSettingsRouter);
router.use(invoicesRouter);
router.use(partsRouter);
router.use(statsRouter);
router.use(analyticsRouter);
router.use(exportRouter);
router.use(storageAdminRouter);

export default router;
