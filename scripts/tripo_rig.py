#!/usr/bin/env python3
"""Tripo API로 기존 GLB를 임포트 → 리깅 → 프리셋 애니메이션 리타겟하는 파이프라인.

사용법:
  python scripts/tripo_rig.py [--check-only]

의존성: pip install tripo3d boto3 aiohttp
API 키: .env의 tripo_api_key
"""

import asyncio
import json
import re
import sys
from pathlib import Path

from tripo3d import TripoClient, TaskStatus

ROOT = Path(__file__).resolve().parent.parent
GLB_PATH = ROOT / "cute+robot+3d+model.glb"
OUTPUT_DIR = ROOT / "public" / "models"
STATE_FILE = ROOT / "assets" / "models" / "tripo-pipeline-state.json"
ANIMATIONS = ["preset:idle", "preset:walk", "preset:jump", "preset:turn"]
CHECK_ONLY = "--check-only" in sys.argv


def load_api_key() -> str:
    content = (ROOT / ".env").read_text()
    match = re.search(r"^\s*tripo_api_key\s*=\s*(\S+)", content, re.MULTILINE | re.IGNORECASE)
    if not match:
        raise SystemExit(".env에서 tripo_api_key를 찾지 못했습니다.")
    return match.group(1)


def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(state: dict) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


async def wait(client: TripoClient, task_id: str, label: str):
    print(f"[{label}] task {task_id} 대기 중...")
    task = await client.wait_for_task(task_id, verbose=True)
    if task.status != TaskStatus.SUCCESS:
        raise SystemExit(f"[{label}] 실패: status={task.status}")
    return task


async def download(client: TripoClient, task, file_name: str) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    files = await client.download_task_models(task, str(OUTPUT_DIR))
    for model_type, file_path in files.items():
        if file_path:
            src = Path(file_path)
            dest = OUTPUT_DIR / file_name
            src.replace(dest)
            size_mb = dest.stat().st_size / 1024 / 1024
            print(f"저장: {dest} ({size_mb:.1f}MB, type={model_type})")
            return
    print(f"경고: 다운로드할 모델 파일이 없습니다. output={task.output}")


async def main() -> None:
    state = load_state()
    async with TripoClient(api_key=load_api_key()) as client:
        balance = await client.get_balance()
        start_balance = balance.balance
        print(f"크레딧 잔액: {start_balance} (frozen: {balance.frozen})")

        if "import_task_id" not in state:
            print("GLB 업로드 + 임포트 중...")
            state["import_task_id"] = await client.import_model(str(GLB_PATH))
            save_state(state)
        await wait(client, state["import_task_id"], "import_model")

        if "prerig_task_id" not in state:
            state["prerig_task_id"] = await client.check_riggable(state["import_task_id"])
            save_state(state)
        prerig = await wait(client, state["prerig_task_id"], "prerigcheck")
        riggable = getattr(prerig.output, "riggable", None)
        print(f"리깅 가능 여부: {riggable}")
        if riggable is False:
            raise SystemExit("이 모델은 자동 리깅이 불가능합니다. 중단합니다.")
        if CHECK_ONLY:
            print("--check-only 모드: 여기서 종료합니다.")
            return

        if "rig_task_id" not in state:
            state["rig_task_id"] = await client.rig_model(
                original_model_task_id=state["import_task_id"],
                model_version="v2.0-20250506",
                out_format="glb",
            )
            save_state(state)
        rig_task = await wait(client, state["rig_task_id"], "animate_rig")
        await download(client, rig_task, "robot-rigged.glb")

        if "retarget_task_id" not in state:
            state["retarget_task_id"] = await client.retarget_animation(
                original_model_task_id=state["rig_task_id"],
                animation=ANIMATIONS,
                out_format="glb",
                bake_animation=True,
                export_with_geometry=True,
            )
            save_state(state)
        retarget_task = await wait(client, state["retarget_task_id"], "animate_retarget")
        await download(client, retarget_task, "robot-animated.glb")

        balance = await client.get_balance()
        print(f"크레딧 잔액: {balance.balance} (사용: {start_balance - balance.balance})")


if __name__ == "__main__":
    asyncio.run(main())
