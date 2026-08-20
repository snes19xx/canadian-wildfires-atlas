export function initScrolly(scene, pause) {
  const sceneEl = document.getElementById("scene");
  const articleEl = document.querySelector("article");
  const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";

  const chip = document.createElement("button");
  chip.className = "back-chip";
  document.body.appendChild(chip);

  let onMap = true;
  function setChip(mapVisible) {
    onMap = mapVisible;
    chip.textContent = mapVisible ? "Read the analysis ↓" : "↑ Back to the map";
    // Clears the timeline
    chip.classList.toggle("above-timeline", mapVisible);
  }
  setChip(true);
  chip.style.display = "block";

  chip.addEventListener("click", () =>
    (onMap ? articleEl : sceneEl).scrollIntoView({ behavior }),
  );

  new IntersectionObserver(
    (entries) => {
      const visible = entries[0].isIntersecting;
      scene.setVisible(visible);
      if (!visible) pause();
      setChip(visible);
    },
    { threshold: 0.05 },
  ).observe(sceneEl);
}
