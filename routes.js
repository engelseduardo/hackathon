import { Router } from "express";
import IrrigationController from "./controllers/IrrigationController.js";

const routes = Router();
routes.post("/irrigation/calc", IrrigationController.calc);
routes.get("/irrigation/defaults", IrrigationController.defaults);

export default routes;
