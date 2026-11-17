#!/bin/sh
# Run in a fresh release workspace beside the trusted infrastructure checkout.
set -eu
repository=https://github.com/Undery33/Undery.git
case "$SOURCE_BRANCH" in feature/*) ;; *) exit 1 ;; esac
git check-ref-format "refs/heads/$SOURCE_BRANCH"

checkout_branch() {
    git init -q "$1"
    git -C "$1" fetch -q --depth=1 --no-tags "$repository" "refs/heads/$2"
    git -C "$1" checkout -q --detach FETCH_HEAD
}
checkout_branch selected "$SOURCE_BRANCH"
revision=$(git -C selected rev-parse HEAD)
if [ -n "${EXPECTED_COMMIT:-}" ] && [ "$revision" != "$EXPECTED_COMMIT" ]; then
    echo 'GitHub activity and branch HEAD differ. Waiting for the next scan.' >&2
    exit 3
fi

if [ "$SOURCE_BRANCH" = feature/site-foundation ] && [ "$revision" != "$PIPELINE_COMMIT" ]; then
    echo 'The pipeline branch changed during checkout. Waiting for the next scan.' >&2
    exit 3
fi

app=../infrastructure
app_branch=feature/site-foundation
if git -C selected cat-file -e HEAD:src/app 2>/dev/null && git -C selected cat-file -e HEAD:package.json 2>/dev/null; then
    app=selected
    app_branch=$SOURCE_BRANCH
fi
if git -C selected cat-file -e HEAD:dist/index.html 2>/dev/null; then
    gui=selected
elif [ "$app" = selected ]; then
    gui=gui
    checkout_branch gui feature/vrchat-web-gui
else
    echo 'No Next.js application or VRChat dist/index.html at the selected revision.' >&2
    exit 1
fi
app_commit=$(git -C "$app" rev-parse HEAD)
gui_commit=$(git -C "$gui" rev-parse HEAD)
python3 ../infrastructure/scripts/prepare-container-context.py --source "$gui" --output context \
    --commit "$revision" --branch "$SOURCE_BRANCH" --pipeline-commit "$PIPELINE_COMMIT" \
    --app-source "$app" --app-commit "$app_commit" --gui-commit "$gui_commit"
mkdir -p artifacts
printf '%s\n' "$revision" > artifacts/source-commit.txt
printf '%s\n' "$app_commit" > artifacts/app-commit.txt
printf '%s\n' "$app_branch" > artifacts/app-branch.txt
printf '%s\n' "$gui_commit" > artifacts/gui-commit.txt
