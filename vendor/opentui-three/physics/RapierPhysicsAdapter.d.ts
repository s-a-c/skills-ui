import type { RigidBody, World } from "@dimforge/rapier2d-simd-compat";
import type { PhysicsVector2, PhysicsRigidBodyDesc, PhysicsColliderDesc, PhysicsRigidBody, PhysicsWorld } from "./physics-interface.js";
export declare class RapierRigidBody implements PhysicsRigidBody {
    private rapierBody;
    constructor(rapierBody: RigidBody);
    applyImpulse(force: PhysicsVector2): void;
    applyTorqueImpulse(torque: number): void;
    getTranslation(): PhysicsVector2;
    getRotation(): number;
    get nativeBody(): RigidBody;
}
export declare class RapierPhysicsWorld implements PhysicsWorld {
    private rapierWorld;
    constructor(rapierWorld: World);
    createRigidBody(desc: PhysicsRigidBodyDesc): PhysicsRigidBody;
    createCollider(colliderDesc: PhysicsColliderDesc, rigidBody: PhysicsRigidBody): void;
    removeRigidBody(rigidBody: PhysicsRigidBody): void;
    static createFromRapierWorld(rapierWorld: World): RapierPhysicsWorld;
}
