import { Router } from "express";
import { getAllManifests, getManifest } from "../../engines/pluginRegistry";

const router = Router();

router.get("/providers", (req, res) => {
  const manifests = getAllManifests();

  const providers = manifests.map((m) => ({
    key: m.key,
    name: m.name,
    description: m.description,
    iconUrl: m.iconUrl,
    docsUrl: m.docsUrl,
    authType: m.authType,
    triggerCount: m.triggers.length,
    actionCount: m.actions.length,
  }));

  return res.json({ providers });
});

router.get("/providers/:key", (req, res) => {
  const manifest = getManifest(req.params.key);

  if (!manifest) {
    return res.status(404).json({ message: `Provider '${req.params.key}' not found` });
  }

  return res.json({ provider: manifest });
});

router.get("/providers/:key/actions", (req, res) => {
  const manifest = getManifest(req.params.key);

  if (!manifest) {
    return res.status(404).json({ message: `Provider '${req.params.key}' not found` });
  }

  return res.json({ actions: manifest.actions });
});

router.get("/providers/:key/triggers", (req, res) => {
  const manifest = getManifest(req.params.key);

  if (!manifest) {
    return res.status(404).json({ message: `Provider '${req.params.key}' not found` });
  }

  return res.json({ triggers: manifest.triggers });
});

export default router;
