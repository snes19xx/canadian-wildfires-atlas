export function initScrolly(scene, pause) {
  const sceneEl = document.getElementById("scene");

  const back = document.createElement("button");
  back.className = "back-chip";
  back.textContent = "↑ Back to the map";
  back.addEventListener("click", () =>
    sceneEl.scrollIntoView({ behavior: "smooth" }),
  );
  document.body.appendChild(back);

  new IntersectionObserver(
    (entries) => {
      const visible = entries[0].isIntersecting;
      scene.setVisible(visible);
      if (!visible) pause();
      back.style.display = visible ? "none" : "block";
    },
    { threshold: 0.05 },
  ).observe(sceneEl);
}
