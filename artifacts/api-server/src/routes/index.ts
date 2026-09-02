import { Router, type IRouter } from "express";
import healthRouter from "./health";
import governanceRouter from "./governance";

const router: IRouter = Router();

router.use(healthRouter);
router.use(governanceRouter);

export default router;
