import { Router } from "express";
import { listarSkills, actualizarSkill, listarPlantillas, obtenerPlantilla } from "../skills/repositorio.js";
import { AppError } from "../utils/errores.js";

export const rutasConfiguracion = Router();

rutasConfiguracion.get("/skills", async (_req, res, next) => {
  try {
    res.json(await listarSkills());
  } catch (e) {
    next(e);
  }
});

rutasConfiguracion.put("/skills/:clave", async (req, res, next) => {
  try {
    const { system_prompt, modelo, esfuerzo, max_tokens, activo } = req.body || {};
    if (esfuerzo && !["low", "medium", "high", "xhigh", "max"].includes(esfuerzo)) throw new AppError("ESFUERZO_INVALIDO", "Esfuerzo invalido", 400);
    await actualizarSkill(req.params.clave, { system_prompt, modelo, esfuerzo, max_tokens, activo });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

rutasConfiguracion.get("/plantillas", async (_req, res, next) => {
  try {
    res.json(await listarPlantillas());
  } catch (e) {
    next(e);
  }
});

rutasConfiguracion.get("/plantillas/:clave", async (req, res, next) => {
  try {
    const p = await obtenerPlantilla(req.params.clave);
    if (!p) throw new AppError("PLANTILLA_INEXISTENTE", "Plantilla no encontrada", 404);
    res.json(p);
  } catch (e) {
    next(e);
  }
});
