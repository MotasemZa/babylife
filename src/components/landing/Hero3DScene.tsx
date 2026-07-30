import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MeshDistortMaterial, Float } from "@react-three/drei";
import * as THREE from "three";

const NODE_COUNT = 80;
const CONNECTION_DISTANCE = 1.8;

function generatePositions(count: number, radius: number) {
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radius * Math.cbrt(Math.random());
    positions.push(
      new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      )
    );
  }
  return positions;
}

function NetworkNodes() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  const positions = useMemo(() => generatePositions(NODE_COUNT, 3.5), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const basePositions = useMemo(() => positions.map((p) => p.clone()), [positions]);

  // Build connection lines
  const linePositions = useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        if (positions[i].distanceTo(positions[j]) < CONNECTION_DISTANCE) {
          pts.push(positions[i].x, positions[i].y, positions[i].z);
          pts.push(positions[j].x, positions[j].y, positions[j].z);
        }
      }
    }
    return new Float32Array(pts);
  }, [positions]);

  useFrame((state) => {
    if (!meshRef.current || !groupRef.current) return;
    const t = state.clock.elapsedTime;

    // Parallax tilt
    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      pointer.x * 0.3,
      0.02
    );
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      -pointer.y * 0.2,
      0.02
    );

    // Slow global rotation
    groupRef.current.rotation.z = t * 0.02;

    // Drift nodes
    for (let i = 0; i < NODE_COUNT; i++) {
      const base = basePositions[i];
      dummy.position.set(
        base.x + Math.sin(t * 0.3 + i) * 0.15,
        base.y + Math.cos(t * 0.25 + i * 0.7) * 0.15,
        base.z + Math.sin(t * 0.35 + i * 1.3) * 0.1
      );
      const scale = 0.03 + Math.sin(t + i) * 0.01;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, NODE_COUNT]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color="hsl(173, 58%, 39%)" toneMapped={false} />
      </instancedMesh>

      {linePositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              array={linePositions}
              count={linePositions.length / 3}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color="hsl(173, 58%, 39%)"
            transparent
            opacity={0.12}
          />
        </lineSegments>
      )}
    </group>
  );
}

function CentralOrb() {
  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.8}>
      <mesh>
        <sphereGeometry args={[0.6, 64, 64]} />
        <MeshDistortMaterial
          color="hsl(173, 58%, 39%)"
          emissive="hsl(173, 58%, 25%)"
          emissiveIntensity={0.8}
          roughness={0.2}
          metalness={0.8}
          distort={0.25}
          speed={2}
          toneMapped={false}
        />
      </mesh>
    </Float>
  );
}

export function Hero3DScene() {
  return (
    <div className="absolute inset-0 w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 55 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "hsl(222, 47%, 6%)" }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.3} />
          <pointLight position={[5, 5, 5]} intensity={0.5} color="hsl(173, 58%, 50%)" />
          <pointLight position={[-5, -3, 3]} intensity={0.3} color="hsl(222, 47%, 50%)" />
          <NetworkNodes />
          <CentralOrb />
        </Suspense>
      </Canvas>
    </div>
  );
}
