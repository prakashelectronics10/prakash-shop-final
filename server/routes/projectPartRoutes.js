const express = require("express");
const {
  getProjectParts,
  getProjectPartBySlug,
  listProjectParts,
  createProjectPart,
  updateProjectPart,
  deleteProjectPart,
  getProjectPartCategories,
  getProjectPartSubCategories,
  getProjectPartTaxonomy,
} = require("../controllers/projectPartController");
const {
  getProjectPartSliders,
  listSliders,
  createSlider,
  updateSlider,
  deleteSlider,
} = require("../controllers/projectPartSliderController");
const { upload, uploadImage } = require("../controllers/uploadController");
const { requireAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

// Public routes for project parts
router.get("/public/parts", getProjectParts);
router.get("/public/parts/:slug", getProjectPartBySlug);
router.get("/public/sliders", getProjectPartSliders);

// Public route for categories
router.get("/public/categories", getProjectPartCategories);
router.get("/public/sub-categories", getProjectPartSubCategories);
router.get("/public/taxonomy", getProjectPartTaxonomy);

// Admin routes for project parts management
router.use("/admin", requireAdmin);
router.get("/admin/project-parts", requirePermission("projectParts", "featuredRepairs"), listProjectParts);
router.post("/admin/project-parts", requirePermission("projectParts", "featuredRepairs"), createProjectPart);
router.put("/admin/project-parts/:id", requirePermission("projectParts", "featuredRepairs"), updateProjectPart);
router.delete("/admin/project-parts/:id", requirePermission("projectParts", "featuredRepairs"), deleteProjectPart);

// Admin routes for slider management
router.get("/admin/project-part-sliders", requirePermission("projectSliders", "featuredRepairs"), listSliders);
router.post("/admin/project-part-sliders", requirePermission("projectSliders", "featuredRepairs"), createSlider);
router.put("/admin/project-part-sliders/:id", requirePermission("projectSliders", "featuredRepairs"), updateSlider);
router.delete("/admin/project-part-sliders/:id", requirePermission("projectSliders", "featuredRepairs"), deleteSlider);

// Image upload for project parts and sliders
router.post("/admin/project-parts/upload", requirePermission("projectParts", "projectSliders", "featuredRepairs"), upload.single("image"), uploadImage);

module.exports = router;
