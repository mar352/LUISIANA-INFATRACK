/**
 * Simple 3-axis gizmo: cream arrows (east / north / up). No bounding cube.
 */

import * as Cesium from "cesium";

export type EditTool = "select" | "move" | "rotate" | "scale";
export type EditAxis = "free" | "x" | "y" | "z" | "xy" | "xz" | "yz";
export type GizmoHandle =
  | "move-x"
  | "move-y"
  | "move-z"
  | "move-xy"
  | "move-xz"
  | "move-yz"
  | "rotate-x"
  | "rotate-y"
  | "rotate-z"
  | "scale"
  | "scale-x"
  | "scale-y"
  | "scale-z";

const PREFIX = "edit-gizmo-";
const AXIS_IDS = [`${PREFIX}ax`, `${PREFIX}ay`, `${PREFIX}az`] as const;
const TIP_IDS = [`${PREFIX}tx`, `${PREFIX}ty`, `${PREFIX}tz`] as const;
const RING_IDS = [`${PREFIX}rx`, `${PREFIX}ry`, `${PREFIX}rz`] as const;
const RING_HANDLE_IDS = [`${PREFIX}hx`, `${PREFIX}hy`, `${PREFIX}hz`] as const;
const VIEW_RING_ID = `${PREFIX}view`;
const SCALE_IDS = [`${PREFIX}sx`, `${PREFIX}sy`, `${PREFIX}sz`] as const;
const SCALE_CENTER_ID = `${PREFIX}sc`;
const GUIDE_ID = `${PREFIX}guide`;
const RING_PICK_IDS = [0, 1, 2].flatMap((axis) =>
  Array.from({ length: 8 }, (_, k) => `${PREFIX}rp${axis}${k}`),
);
const ALL_IDS = [
  ...AXIS_IDS,
  ...TIP_IDS,
  ...RING_IDS,
  ...RING_HANDLE_IDS,
  VIEW_RING_ID,
  ...SCALE_IDS,
  SCALE_CENTER_ID,
  GUIDE_ID,
  ...RING_PICK_IDS,
];

const CREAM = Cesium.Color.fromCssColorString("#f3edd4");
const GOLD = Cesium.Color.fromCssColorString("#ffc107");
const GUIDE_DASH = new Cesium.PolylineDashMaterialProperty({
  color: GOLD,
  dashLength: 18,
});

const _origin = new Cesium.Cartesian3();
const _enu = new Cesium.Matrix4();
const _poseOrigin = new Cesium.Cartesian3();
const _poseTips = [
  new Cesium.Cartesian3(),
  new Cesium.Cartesian3(),
  new Cesium.Cartesian3(),
];
const _guideA = new Cesium.Cartesian3();
const _guideB = new Cesium.Cartesian3();
const _guideDir = new Cesium.Cartesian3();
const _scratchLocal = new Cesium.Cartesian3();
let _poseLen = 24;
let _hoverKey: string | null = null;
let _gizmoMode: EditTool = "move";
let _gizmoShown = false;
let _sizeTickRemove: (() => void) | null = null;
let _sizeViewer: Cesium.Viewer | null = null;

function gizmoLengthM(viewer: Cesium.Viewer, origin: Cesium.Cartesian3): number {
  const dist = Math.max(6, Cesium.Cartesian3.distance(viewer.camera.positionWC, origin));
  const h = Math.max(360, viewer.scene.canvas?.clientHeight ?? 720);
  const frustum = viewer.camera.frustum as Cesium.PerspectiveFrustum;
  const fovy =
    typeof frustum.fovy === "number" && frustum.fovy > 0.05 ? frustum.fovy : Math.PI / 3;
  const world = dist * Math.tan(fovy * 0.5) * 2 * (120 / h);
  return Math.max(3, Math.min(280, world));
}

function writePoseTips(length: number) {
  _poseLen = length;
  _scratchLocal.x = length;
  _scratchLocal.y = 0;
  _scratchLocal.z = 0;
  Cesium.Matrix4.multiplyByPoint(_enu, _scratchLocal, _poseTips[0]);
  _scratchLocal.x = 0;
  _scratchLocal.y = length;
  Cesium.Matrix4.multiplyByPoint(_enu, _scratchLocal, _poseTips[1]);
  _scratchLocal.y = 0;
  _scratchLocal.z = length;
  Cesium.Matrix4.multiplyByPoint(_enu, _scratchLocal, _poseTips[2]);
}

function updatePoseLengthFromCamera(viewer: Cesium.Viewer) {
  if (!_gizmoShown || viewer.isDestroyed()) return;
  if (Cesium.Cartesian3.magnitudeSquared(_poseOrigin) < 1) return;
  const L = gizmoLengthM(viewer, _poseOrigin);
  if (Math.abs(L - _poseLen) < 1e-4) return;
  writePoseTips(L);
}

function bindSizeTick(viewer: Cesium.Viewer) {
  _sizeViewer = viewer;
  if (_sizeTickRemove) return;
  const rem = viewer.scene.preUpdate.addEventListener(() => {
    updatePoseLengthFromCamera(viewer);
  });
  _sizeTickRemove = typeof rem === "function" ? rem : null;
}

function unbindSizeTick() {
  try {
    _sizeTickRemove?.();
  } catch {
    /* already gone */
  }
  _sizeTickRemove = null;
  _sizeViewer = null;
}

export function isGizmoEntityId(id: string | undefined): boolean {
  return Boolean(id && id.startsWith(PREFIX));
}

export function pickGizmoHandle(
  viewer: Cesium.Viewer,
  screenPos: Cesium.Cartesian2,
): GizmoHandle | null {
  if (viewer.isDestroyed()) return null;
  const picked = viewer.scene.pick(screenPos);
  if (!Cesium.defined(picked)) return null;
  const raw = (picked as { id?: unknown }).id;
  const id =
    typeof raw === "string" ? raw : raw instanceof Cesium.Entity ? raw.id : undefined;
  if (!id || !id.startsWith(PREFIX)) return null;
  if (id.includes("rp0") || id.endsWith("rx") || id.endsWith("hx")) return "rotate-x";
  if (id.includes("rp1") || id.endsWith("ry") || id.endsWith("hy")) return "rotate-y";
  if (id.includes("rp2") || id.endsWith("rz") || id.endsWith("hz")) return "rotate-z";
  if (id.endsWith("sx")) return "scale-x";
  if (id.endsWith("sy")) return "scale-y";
  if (id.endsWith("sz")) return "scale-z";
  if (id.endsWith("sc")) return "scale";
  if (id.endsWith("ax") || id.endsWith("tx")) return "move-x";
  if (id.endsWith("ay") || id.endsWith("ty")) return "move-y";
  if (id.endsWith("az") || id.endsWith("tz")) return "move-z";
  if (id.endsWith("view")) return "rotate-z";
  return "move-xy";
}

export function setEditGizmoHover(viewer: Cesium.Viewer, handle: GizmoHandle | null) {
  if (viewer.isDestroyed()) return;
  const next =
    handle === "move-x" || handle === "rotate-x" || handle === "scale-x"
      ? "x"
      : handle === "move-y" || handle === "rotate-y" || handle === "scale-y"
        ? "y"
        : handle === "move-z" || handle === "rotate-z" || handle === "scale-z"
          ? "z"
          : handle === "scale"
            ? "u"
            : null;
  if (next === _hoverKey) return;
  _hoverKey = next;
  const guide = viewer.entities.getById(GUIDE_ID);
  if (guide) {
    const showGuide = next === "x" || next === "y" || next === "z";
    guide.show = showGuide && (_gizmoMode === "move" || _gizmoMode === "scale");
  }
  viewer.scene.requestRender();
}

export function resizeEditGizmo(viewer: Cesium.Viewer) {
  updatePoseLengthFromCamera(viewer);
}

export function removeEditGizmo(viewer: Cesium.Viewer) {
  _gizmoShown = false;
  unbindSizeTick();
  if (viewer.isDestroyed()) return;
  _hoverKey = null;
  const doomed: Cesium.Entity[] = [];
  for (const e of viewer.entities.values) {
    if (typeof e.id === "string" && e.id.startsWith(PREFIX)) doomed.push(e);
  }
  for (const e of doomed) {
    try {
      viewer.entities.remove(e);
    } catch {
      /* already gone */
    }
  }
}

export function gizmoHandleToAxis(handle: GizmoHandle): EditAxis {
  if (handle === "move-x" || handle === "rotate-x" || handle === "scale-x") return "x";
  if (handle === "move-y" || handle === "rotate-y" || handle === "scale-y") return "y";
  if (handle === "move-z" || handle === "rotate-z" || handle === "scale-z") return "z";
  return "free";
}

export function syncEditGizmo(
  viewer: Cesium.Viewer,
  opts: {
    show: boolean;
    lon: number;
    lat: number;
    heightM: number;
    rotationDeg?: number;
    tool: EditTool;
    axis: EditAxis;
    cameraHeightM: number;
    resize?: boolean;
    scaleMultiplier?: number;
  },
) {
  try {
    if (viewer.isDestroyed()) return;
    removeStrayGizmoEntities(viewer);

    if (!opts.show || opts.tool === "select" || !Number.isFinite(opts.lon) || !Number.isFinite(opts.lat)) {
      removeEditGizmo(viewer);
      return;
    }

    const onGround = Math.abs(opts.heightM) < 1e-4;
    const z = onGround ? 1.2 : opts.heightM + 1.2;
    const origin = Cesium.Cartesian3.fromDegrees(opts.lon, opts.lat, z, undefined, _origin);
    Cesium.Transforms.eastNorthUpToFixedFrame(origin, undefined, _enu);
    Cesium.Cartesian3.clone(origin, _poseOrigin);
    _gizmoMode = opts.tool;
    _gizmoShown = true;
    writePoseTips(gizmoLengthM(viewer, origin));
    bindSizeTick(viewer);

    const axisKey = (i: number) => (i === 0 ? "x" : i === 1 ? "y" : "z");
    const showMove = opts.tool === "move";
    const showRotate = opts.tool === "rotate";
    const showScale = opts.tool === "scale";

    for (let i = 0; i < 3; i++) {
      const axisI = i;
      let line = viewer.entities.getById(AXIS_IDS[i]);
      if (!line || !line.polyline) {
        if (line) viewer.entities.remove(line);
        line = viewer.entities.add({
          id: AXIS_IDS[i],
          name: AXIS_IDS[i],
          shadows: Cesium.ShadowMode.DISABLED,
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              return [
                Cesium.Cartesian3.clone(_poseOrigin),
                Cesium.Cartesian3.clone(_poseTips[axisI]),
              ];
            }, false),
            width: new Cesium.CallbackProperty(() => (_hoverKey === axisKey(axisI) ? 6 : 4), false),
            material: new Cesium.ColorMaterialProperty(
              new Cesium.CallbackProperty(() => (_hoverKey === axisKey(axisI) ? GOLD : CREAM), false),
            ),
            clampToGround: false,
            arcType: Cesium.ArcType.NONE,
          },
        });
      }
      line.show = showMove || showScale;

      let head = viewer.entities.getById(TIP_IDS[i]);
      if (!head || !head.billboard) {
        if (head) viewer.entities.remove(head);
        head = viewer.entities.add({
          id: TIP_IDS[i],
          name: TIP_IDS[i],
          shadows: Cesium.ShadowMode.DISABLED,
          position: new Cesium.CallbackPositionProperty(() => {
            return Cesium.Cartesian3.clone(_poseTips[axisI], new Cesium.Cartesian3());
          }, false),
          point: {
            pixelSize: 36,
            color: Cesium.Color.WHITE.withAlpha(0.01),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          billboard: {
            image: arrowImage(),
            width: new Cesium.CallbackProperty(() => (_hoverKey === axisKey(axisI) ? 36 : 28), false),
            height: new Cesium.CallbackProperty(() => (_hoverKey === axisKey(axisI) ? 36 : 28), false),
            color: new Cesium.CallbackProperty(() => (_hoverKey === axisKey(axisI) ? GOLD : CREAM), false),
            alignedAxis: new Cesium.CallbackProperty(() => {
              return Cesium.Cartesian3.normalize(
                Cesium.Cartesian3.subtract(_poseTips[axisI], _poseOrigin, new Cesium.Cartesian3()),
                new Cesium.Cartesian3(),
              );
            }, false),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }
      head.show = showMove;
    }

    for (let i = 0; i < 3; i++) {
      const axisI = i;
      let ring = viewer.entities.getById(RING_IDS[i]);
      if (!ring || !ring.polyline) {
        if (ring) viewer.entities.remove(ring);
        ring = viewer.entities.add({
          id: RING_IDS[i],
          name: RING_IDS[i],
          shadows: Cesium.ShadowMode.DISABLED,
          polyline: {
            positions: new Cesium.CallbackProperty(() => ringPositions(axisI, 1), false),
            width: new Cesium.CallbackProperty(() => (_hoverKey === axisKey(axisI) ? 4 : 2.5), false),
            material: new Cesium.ColorMaterialProperty(
              new Cesium.CallbackProperty(
                () => (_hoverKey === axisKey(axisI) ? GOLD : CREAM.withAlpha(0.92)),
                false,
              ),
            ),
            clampToGround: false,
            arcType: Cesium.ArcType.NONE,
          },
        });
      }
      ring.show = showRotate;

      let handle = viewer.entities.getById(RING_HANDLE_IDS[i]);
      if (!handle || !handle.billboard) {
        if (handle) viewer.entities.remove(handle);
        handle = viewer.entities.add({
          id: RING_HANDLE_IDS[i],
          name: RING_HANDLE_IDS[i],
          shadows: Cesium.ShadowMode.DISABLED,
          position: new Cesium.CallbackPositionProperty(() => ringPoint(axisI, Math.PI / 2), false),
          point: {
            pixelSize: 28,
            color: Cesium.Color.WHITE.withAlpha(0.01),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          billboard: {
            image: arrowImage(),
            width: 22,
            height: 22,
            color: new Cesium.CallbackProperty(() => (_hoverKey === axisKey(axisI) ? GOLD : CREAM), false),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }
      handle.show = showRotate;

      for (let k = 0; k < 8; k++) {
        const pid = `${PREFIX}rp${i}${k}`;
        const ang = (k / 8) * Math.PI * 2;
        let pick = viewer.entities.getById(pid);
        if (!pick) {
          pick = viewer.entities.add({
            id: pid,
            name: pid,
            shadows: Cesium.ShadowMode.DISABLED,
            position: new Cesium.CallbackPositionProperty(() => ringPoint(axisI, ang), false),
            point: {
              pixelSize: 18,
              color: Cesium.Color.WHITE.withAlpha(0.01),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }
        pick.show = showRotate;
      }
    }

    let viewRing = viewer.entities.getById(VIEW_RING_ID);
    if (!viewRing || !viewRing.polyline) {
      if (viewRing) viewer.entities.remove(viewRing);
      viewRing = viewer.entities.add({
        id: VIEW_RING_ID,
        name: VIEW_RING_ID,
        shadows: Cesium.ShadowMode.DISABLED,
        polyline: {
          positions: new Cesium.CallbackProperty(() => viewRingPositions(viewer), false),
          width: 1.5,
          material: CREAM.withAlpha(0.35),
          clampToGround: false,
          arcType: Cesium.ArcType.NONE,
        },
      });
    }
    viewRing.show = showRotate;

    for (let i = 0; i < 3; i++) {
      const axisI = i;
      let cube = viewer.entities.getById(SCALE_IDS[i]);
      if (!cube || !cube.billboard) {
        if (cube) viewer.entities.remove(cube);
        cube = viewer.entities.add({
          id: SCALE_IDS[i],
          name: SCALE_IDS[i],
          shadows: Cesium.ShadowMode.DISABLED,
          position: new Cesium.CallbackPositionProperty(() => {
            return Cesium.Cartesian3.clone(_poseTips[axisI], new Cesium.Cartesian3());
          }, false),
          point: {
            pixelSize: 28,
            color: Cesium.Color.WHITE.withAlpha(0.01),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          billboard: {
            image: cubeImage(),
            width: new Cesium.CallbackProperty(() => (_hoverKey === axisKey(axisI) ? 22 : 16), false),
            height: new Cesium.CallbackProperty(() => (_hoverKey === axisKey(axisI) ? 22 : 16), false),
            color: new Cesium.CallbackProperty(() => (_hoverKey === axisKey(axisI) ? GOLD : CREAM), false),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }
      cube.show = showScale;
    }

    let center = viewer.entities.getById(SCALE_CENTER_ID);
    if (!center || !center.billboard) {
      if (center) viewer.entities.remove(center);
      center = viewer.entities.add({
        id: SCALE_CENTER_ID,
        name: SCALE_CENTER_ID,
        shadows: Cesium.ShadowMode.DISABLED,
        position: new Cesium.CallbackPositionProperty(() => Cesium.Cartesian3.clone(_poseOrigin), false),
        point: {
          pixelSize: 26,
          color: Cesium.Color.WHITE.withAlpha(0.01),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        billboard: {
          image: cubeImage(),
          width: new Cesium.CallbackProperty(() => (_hoverKey === "u" ? 20 : 14), false),
          height: new Cesium.CallbackProperty(() => (_hoverKey === "u" ? 20 : 14), false),
          color: new Cesium.CallbackProperty(() => (_hoverKey === "u" ? GOLD : CREAM), false),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
    center.show = showScale;

    let guide = viewer.entities.getById(GUIDE_ID);
    if (!guide || !guide.polyline) {
      if (guide) viewer.entities.remove(guide);
      guide = viewer.entities.add({
        id: GUIDE_ID,
        name: GUIDE_ID,
        shadows: Cesium.ShadowMode.DISABLED,
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            const axisI = _hoverKey === "x" ? 0 : _hoverKey === "y" ? 1 : _hoverKey === "z" ? 2 : null;
            if (axisI == null) {
              return [Cesium.Cartesian3.clone(_poseOrigin), Cesium.Cartesian3.clone(_poseOrigin)];
            }
            Cesium.Cartesian3.subtract(_poseTips[axisI], _poseOrigin, _guideDir);
            Cesium.Cartesian3.normalize(_guideDir, _guideDir);
            const ext = _poseLen * 14;
            Cesium.Cartesian3.multiplyByScalar(_guideDir, ext, _guideA);
            Cesium.Cartesian3.subtract(_poseOrigin, _guideA, _guideA);
            Cesium.Cartesian3.multiplyByScalar(_guideDir, ext, _guideB);
            Cesium.Cartesian3.add(_poseOrigin, _guideB, _guideB);
            return [Cesium.Cartesian3.clone(_guideA), Cesium.Cartesian3.clone(_guideB)];
          }, false),
          width: 2,
          material: GUIDE_DASH,
          clampToGround: false,
          arcType: Cesium.ArcType.NONE,
        },
      });
    }
    guide.show =
      (_gizmoMode === "move" || _gizmoMode === "scale") &&
      (_hoverKey === "x" || _hoverKey === "y" || _hoverKey === "z");
  } catch (err) {
    console.warn("[edit-gizmo] sync skipped:", err);
  }
}

const RING_SEGS = 48;
const _ringLocalScratch = new Cesium.Cartesian3();
const _ringScratch = [0, 1, 2].map(() =>
  Array.from({ length: RING_SEGS + 1 }, () => new Cesium.Cartesian3()),
);
const _viewRingScratch = Array.from({ length: RING_SEGS + 1 }, () => new Cesium.Cartesian3());
const _viewE = new Cesium.Cartesian3();
const _viewN = new Cesium.Cartesian3();

function ringLocalInto(
  axis: number,
  angle: number,
  radius: number,
  result: Cesium.Cartesian3,
): Cesium.Cartesian3 {
  const c = Math.cos(angle) * radius;
  const s = Math.sin(angle) * radius;
  if (axis === 0) {
    result.x = 0;
    result.y = c;
    result.z = s;
  } else if (axis === 1) {
    result.x = c;
    result.y = 0;
    result.z = s;
  } else {
    result.x = c;
    result.y = s;
    result.z = 0;
  }
  return result;
}

function ringPoint(axis: number, angle: number): Cesium.Cartesian3 {
  ringLocalInto(axis, angle, _poseLen, _ringLocalScratch);
  return Cesium.Matrix4.multiplyByPoint(_enu, _ringLocalScratch, new Cesium.Cartesian3());
}

function ringPositions(axis: number, scale = 1): Cesium.Cartesian3[] {
  const pts = _ringScratch[axis] ?? _ringScratch[0];
  const r = _poseLen * scale;
  for (let i = 0; i <= RING_SEGS; i++) {
    const a = (i / RING_SEGS) * Math.PI * 2;
    ringLocalInto(axis, a, r, _ringLocalScratch);
    Cesium.Matrix4.multiplyByPoint(_enu, _ringLocalScratch, pts[i]);
  }
  return pts;
}

function viewRingPositions(viewer: Cesium.Viewer): Cesium.Cartesian3[] {
  updatePoseLengthFromCamera(viewer);
  const right = viewer.camera.right;
  const up = viewer.camera.up;
  const r = _poseLen * 1.28;
  const pts = _viewRingScratch;
  for (let i = 0; i <= RING_SEGS; i++) {
    const a = (i / RING_SEGS) * Math.PI * 2;
    Cesium.Cartesian3.multiplyByScalar(right, Math.cos(a) * r, _viewE);
    Cesium.Cartesian3.multiplyByScalar(up, Math.sin(a) * r, _viewN);
    Cesium.Cartesian3.add(_poseOrigin, _viewE, pts[i]);
    Cesium.Cartesian3.add(pts[i], _viewN, pts[i]);
  }
  return pts;
}

function removeStrayGizmoEntities(viewer: Cesium.Viewer) {
  const keep = new Set<string>(ALL_IDS);
  const extra: Cesium.Entity[] = [];
  for (const e of viewer.entities.values) {
    if (typeof e.id === "string" && e.id.startsWith(PREFIX) && !keep.has(e.id)) extra.push(e);
  }
  for (const e of extra) viewer.entities.remove(e);
}

let _arrowImg: string | null = null;
function arrowImage(): string {
  if (_arrowImg) return _arrowImg;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) return "";
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = "#f3edd4";
  g.beginPath();
  g.moveTo(32, 4);
  g.lineTo(58, 52);
  g.lineTo(32, 42);
  g.lineTo(6, 52);
  g.closePath();
  g.fill();
  _arrowImg = c.toDataURL("image/png");
  return _arrowImg;
}

let _cubeImg: string | null = null;
function cubeImage(): string {
  if (_cubeImg) return _cubeImg;
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const g = c.getContext("2d");
  if (!g) return "";
  g.clearRect(0, 0, 32, 32);
  g.fillStyle = "#f3edd4";
  g.fillRect(6, 6, 20, 20);
  g.strokeStyle = "#151c28";
  g.lineWidth = 2;
  g.strokeRect(6, 6, 20, 20);
  _cubeImg = c.toDataURL("image/png");
  return _cubeImg;
}
