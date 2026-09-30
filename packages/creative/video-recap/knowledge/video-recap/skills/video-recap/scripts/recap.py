#!/usr/bin/env python3
"""CLI entrypoint for the self-contained video-recap orchestrator."""

from recap_runner import main

__all__ = ["main"]

if __name__ == "__main__":
    import sys
    if "--review-drama-media" in sys.argv:
        sys.argv.remove("--review-drama-media")
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'drama/skills/short-drama-review/scripts'))
        from media_review import main as review_main
        review_main()
    elif "--draft" in sys.argv:
        sys.argv.remove("--draft")
        from draft import main as draft_main
        draft_main()
    else:
        main()
