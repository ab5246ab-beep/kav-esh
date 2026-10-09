import { createFileRoute } from "@tanstack/react-router";
import { GameApp } from "@/components/game-app";

export const Route = createFileRoute("/")({
  component: GameApp,
});
