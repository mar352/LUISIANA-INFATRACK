import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import "./PanoramaViewer.css";

interface PanoramaViewerProps {
  imageUrl: string;
  onLoaded?: () => void;
  onHeadingChange?: (headingDeg: number) => void;
  initialFov?: number;
  autoRotateDefault?: boolean;
}

const PanoramaViewerComponent: React.FC<PanoramaViewerProps> = ({
  imageUrl,
  onLoaded,
  onHeadingChange,
  initialFov = 75,
  autoRotateDefault = false,
}) => {
  // Dedicated mount ref for Three.js canvas (MUST NOT contain any React children!)
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [autoRotate, setAutoRotate] = useState(autoRotateDefault);
  const [isGrabbing, setIsGrabbing] = useState(false);

  // Stable refs for callbacks so callback changes NEVER cause re-renders or effect re-runs
  const onHeadingChangeRef = useRef(onHeadingChange);
  onHeadingChangeRef.current = onHeadingChange;

  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  // References for Three.js state across re-renders
  const stateRef = useRef({
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,
    renderer: null as THREE.WebGLRenderer | null,
    mesh: null as THREE.Mesh | null,
    material: null as THREE.MeshBasicMaterial | null,
    texture: null as THREE.Texture | null,
    animationId: 0,
    isUserInteracting: false,
    onPointerDownMouseX: 0,
    onPointerDownMouseY: 0,
    onPointerDownLon: 0,
    onPointerDownLat: 0,
    lon: 180,
    lat: 0,
    targetLon: 180,
    targetLat: 0,
    autoRotate: autoRotateDefault,
    currentImageUrl: "",
  });

  // Sync autoRotate state to ref
  useEffect(() => {
    stateRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  // Handle zoom in / out
  const handleZoom = useCallback((direction: "in" | "out") => {
    const camera = stateRef.current.camera;
    if (!camera) return;
    const delta = direction === "in" ? -10 : 10;
    camera.fov = Math.max(35, Math.min(95, camera.fov + delta));
    camera.updateProjectionMatrix();
  }, []);

  // Reset view to frontal orientation
  const handleResetView = useCallback(() => {
    stateRef.current.targetLon = 180;
    stateRef.current.targetLat = 0;
  }, []);

  // 1. Initialize WebGL Renderer & Scene ONCE on mount in the dedicated canvasMount div
  useEffect(() => {
    const canvasMount = canvasMountRef.current;
    if (!canvasMount) return;

    const width = canvasMount.clientWidth || window.innerWidth;
    const height = canvasMount.clientHeight || window.innerHeight;

    // Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(initialFov, width / height, 1, 1200);
    camera.target = new THREE.Vector3(0, 0, 0);

    // WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Mount canvas into dedicated leaf element
    canvasMount.appendChild(renderer.domElement);

    // Sphere Geometry (inverted so camera sees interior)
    const geometry = new THREE.SphereGeometry(500, 64, 40);
    geometry.scale(-1, 1, 1);

    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    stateRef.current.scene = scene;
    stateRef.current.camera = camera;
    stateRef.current.renderer = renderer;
    stateRef.current.mesh = mesh;
    stateRef.current.material = material;

    // Interaction Handlers (Pointer / Mouse / Touch)
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      stateRef.current.isUserInteracting = true;
      setIsGrabbing(true);

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      stateRef.current.onPointerDownMouseX = clientX;
      stateRef.current.onPointerDownMouseY = clientY;
      stateRef.current.onPointerDownLon = stateRef.current.targetLon;
      stateRef.current.onPointerDownLat = stateRef.current.targetLat;
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      if (!stateRef.current.isUserInteracting) return;

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const factor = (camera.fov / 75) * 0.16;
      stateRef.current.targetLon =
        (stateRef.current.onPointerDownMouseX - clientX) * factor +
        stateRef.current.onPointerDownLon;
      stateRef.current.targetLat =
        (clientY - stateRef.current.onPointerDownMouseY) * factor +
        stateRef.current.onPointerDownLat;
    };

    const onPointerUp = () => {
      stateRef.current.isUserInteracting = false;
      setIsGrabbing(false);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * 0.05;
      camera.fov = Math.max(35, Math.min(95, camera.fov + delta));
      camera.updateProjectionMatrix();
    };

    const onResize = () => {
      if (!canvasMount || !renderer || !camera) return;
      const w = canvasMount.clientWidth || window.innerWidth;
      const h = canvasMount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    canvasMount.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);

    canvasMount.addEventListener("touchstart", onPointerDown, { passive: true });
    window.addEventListener("touchmove", onPointerMove, { passive: true });
    window.addEventListener("touchend", onPointerUp);

    canvasMount.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);

    // Animation Render Loop with Inertia Damping
    let lastHeadingReport = -999;
    const animate = () => {
      stateRef.current.animationId = requestAnimationFrame(animate);

      // Smooth damping interpolation (momentum)
      stateRef.current.lon += (stateRef.current.targetLon - stateRef.current.lon) * 0.12;
      stateRef.current.lat += (stateRef.current.targetLat - stateRef.current.lat) * 0.12;

      // Auto-rotate when idle
      if (stateRef.current.autoRotate && !stateRef.current.isUserInteracting) {
        stateRef.current.targetLon += 0.12;
        stateRef.current.lon += 0.12;
      }

      // Clamp vertical pitch to avoid gimbal flip (-85° to 85°)
      stateRef.current.targetLat = Math.max(-85, Math.min(85, stateRef.current.targetLat));
      const lat = Math.max(-85, Math.min(85, stateRef.current.lat));
      const phi = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(stateRef.current.lon);

      const target = new THREE.Vector3();
      target.x = 500 * Math.sin(phi) * Math.cos(theta);
      target.y = 500 * Math.cos(phi);
      target.z = 500 * Math.sin(phi) * Math.sin(theta);

      camera.lookAt(target);
      renderer.render(scene, camera);

      // Report heading in degrees (0 - 360) throttled
      const headingDeg = Math.round((((stateRef.current.lon - 180) % 360) + 360) % 360);
      if (Math.abs(headingDeg - lastHeadingReport) >= 2) {
        lastHeadingReport = headingDeg;
        onHeadingChangeRef.current?.(headingDeg);
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(stateRef.current.animationId);

      canvasMount.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);

      canvasMount.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerUp);

      canvasMount.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);

      if (stateRef.current.texture) stateRef.current.texture.dispose();
      material.dispose();
      geometry.dispose();

      if (renderer.domElement && canvasMount.contains(renderer.domElement)) {
        canvasMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [initialFov]); // Only run once on mount!

  // 2. Load and pre-process texture smoothly so the ends connect seamlessly with ZERO black gap!
  useEffect(() => {
    if (!imageUrl) return;
    if (stateRef.current.currentImageUrl === imageUrl && stateRef.current.texture) return;

    stateRef.current.currentImageUrl = imageUrl;
    setLoading(true);

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      // Create an offscreen canvas to seamlessly blend ends and fill transparent edges
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (!ctx) {
        setLoading(false);
        return;
      }

      // 1. Fill background with natural ambient sky-to-ground gradient
      // Ensures that any curved bow-tie / transparent borders from phone cameras never show black!
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, "#75a7db");    // Natural sky blue
      bgGrad.addColorStop(0.38, "#a2c5e8"); // Soft horizon haze
      bgGrad.addColorStop(0.55, "#8695a6"); // Ground / vegetation
      bgGrad.addColorStop(1, "#4f5a6a");    // Asphalt / road bottom
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Draw the photo on top
      ctx.drawImage(img, 0, 0, w, h);

      // 3. Seamless Edge-Blending:
      // Smoothly cross-fade the right edge into the left edge across blendWidth
      // so the connection between the two ends is 100% continuous with ZERO black gap!
      try {
        const blendWidth = Math.max(24, Math.min(100, Math.round(w * 0.045))); // ~4.5% of width
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        for (let y = 0; y < h; y++) {
          const rowOffset = y * w;
          for (let i = 0; i < blendWidth; i++) {
            const leftIdx = (rowOffset + i) * 4;
            const rightX = w - blendWidth + i;
            const rightIdx = (rowOffset + rightX) * 4;

            // t goes from 0 (at start of blend) to 1 (at extreme edge x = w - 1)
            const t = (i + 1) / blendWidth;

            // Interpolate right edge pixels towards left edge pixels
            data[rightIdx] = Math.round(data[rightIdx] * (1 - t) + data[leftIdx] * t);
            data[rightIdx + 1] = Math.round(data[rightIdx + 1] * (1 - t) + data[leftIdx + 1] * t);
            data[rightIdx + 2] = Math.round(data[rightIdx + 2] * (1 - t) + data[leftIdx + 2] * t);
            data[rightIdx + 3] = 255; // Fully opaque

            // Ensure left edge strip is also fully opaque
            if (data[leftIdx + 3] < 255) {
              data[leftIdx + 3] = 255;
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
      } catch (e) {
        // Fallback if canvas security restricts getImageData (cross-origin without CORS)
        console.warn("Canvas getImageData edge-blend fallback:", e);
      }

      // Create Three.js Texture with RepeatWrapping for seamless connection
      const newTexture = new THREE.CanvasTexture(canvas);
      newTexture.colorSpace = THREE.SRGBColorSpace;
      newTexture.wrapS = THREE.RepeatWrapping;
      newTexture.wrapT = THREE.ClampToEdgeWrapping;
      newTexture.minFilter = THREE.LinearFilter;
      newTexture.magFilter = THREE.LinearFilter;
      newTexture.generateMipmaps = false;

      if (stateRef.current.material) {
        const oldTexture = stateRef.current.texture;
        stateRef.current.material.color.setHex(0xffffff);
        stateRef.current.material.map = newTexture;
        stateRef.current.material.needsUpdate = true;
        oldTexture?.dispose();
      }
      stateRef.current.texture = newTexture;
      setLoading(false);
      onLoadedRef.current?.();
    };

    img.onerror = (err) => {
      console.warn("Failed to load panorama image:", err);
      setLoading(false);
    };

    img.src = imageUrl;
  }, [imageUrl]);

  return (
    <div
      className={`panorama-viewer-container ${isGrabbing ? "is-grabbing" : ""}`}
      title="I-click at i-drag para lumingon sa paligid (Google Street View)"
    >
      {/* 1. Dedicated mount container for Three.js Canvas (NO React children inside this div!) */}
      <div ref={canvasMountRef} className="panorama-canvas-wrap" />

      {/* 2. React UI elements (completely safe from DOM removal conflicts!) */}
      {loading && (
        <div className="panorama-loading-overlay">
          <div className="panorama-spinner" />
          <span className="panorama-loading-text">Ikinakarga ang 360° Street View Panorama...</span>
        </div>
      )}

      {/* Floating Street View Controls (Bottom Right) */}
      <div className="panorama-controls-hub">
        <button
          type="button"
          className="panorama-ctrl-btn"
          onClick={() => handleZoom("in")}
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        <button
          type="button"
          className="panorama-ctrl-btn"
          onClick={() => handleZoom("out")}
          title="Zoom out (-)"
          aria-label="Zoom out"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        <button
          type="button"
          className={`panorama-ctrl-btn ${autoRotate ? "is-active" : ""}`}
          onClick={() => setAutoRotate((prev) => !prev)}
          title={autoRotate ? "Ihinto ang Auto-Rotate" : "Simulan ang Auto-Rotate"}
          aria-label="Auto-rotate"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </button>

        <button
          type="button"
          className="panorama-ctrl-btn"
          onClick={handleResetView}
          title="I-reset sa Harap (Center Frontal View)"
          aria-label="Reset View"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </button>
      </div>

      {/* Street View Drag Hint (Fades out quickly) */}
      <div className="panorama-drag-hint">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="5 9 2 12 5 15" />
          <polyline points="9 5 12 2 15 5" />
          <polyline points="15 19 12 22 9 19" />
          <polyline points="19 9 22 12 19 15" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <line x1="12" y1="2" x2="12" y2="22" />
        </svg>
        <span>I-click at i-drag para lumingon sa kalsada at lote</span>
      </div>
    </div>
  );
};

export const PanoramaViewer = React.memo(PanoramaViewerComponent);
