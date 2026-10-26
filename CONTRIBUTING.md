# 같이 만드는 방법 🤝

GitHub에서 여러 사람이 한 프로젝트를 같이 만들 때 쓰는 기본 흐름이에요.
처음엔 낯설어도 한두 번 해 보면 금방 익숙해져요.

```
이슈 고르기 → 브랜치 만들기 → 코드 수정 → 커밋 → 푸시 → Pull Request → 리뷰 → 머지
```

---

## 0. 처음 한 번만 하는 준비

1. [GitHub](https://github.com) 계정을 만들어요.
2. [Git](https://git-scm.com/downloads)을 설치하고, 내 이름과 이메일을 등록해요.
   ```bash
   git config --global user.name "내 이름"
   git config --global user.email "github에-가입한-이메일@example.com"
   ```
3. 저장소 주인에게 **협업자(Collaborator)로 초대**해 달라고 해요.
   (주인이 저장소 → Settings → Collaborators → Add people 에서 초대 → 이메일로 온 초대를 수락)
4. 저장소를 내 컴퓨터로 복사(clone)해요.
   ```bash
   git clone https://github.com/junhyeong05/game.git
   cd game
   ```

## 1. 할 일(이슈) 고르기

- 저장소의 **Issues** 탭에서 하고 싶은 일을 골라요. `good first issue` 라벨이 붙은 게 쉬워요.
- 고른 이슈에 "제가 할게요!" 라고 댓글을 남기면, 두 사람이 같은 일을 하는 걸 막을 수 있어요.
- 하고 싶은 게 목록에 없으면 **New issue** 로 직접 만들어도 돼요.

## 2. 최신 코드 받고 브랜치 만들기

`main`은 모두가 같이 쓰는 "완성본"이에요. 직접 고치지 말고, 내 작업용 **브랜치(가지)** 를 만들어서 작업해요.

```bash
git switch main
git pull                       # 다른 사람이 올린 최신 코드 받기
git switch -c feat/enemy-color # 새 브랜치 만들고 이동
```

브랜치 이름은 무슨 작업인지 알 수 있게 지어요.

| 앞부분 | 언제 | 예시 |
| --- | --- | --- |
| `feat/` | 새 기능 | `feat/heart-item` |
| `fix/` | 버그 수정 | `fix/score-reset` |
| `docs/` | 문서 수정 | `docs/readme-typo` |
| `style/` | 디자인만 변경 | `style/button-color` |

## 3. 코드 수정하고 확인하기

- 코드를 고친 뒤 `index.html`을 브라우저에서 열어 직접 플레이해 봐요.
- 브라우저에서 `F12` → **Console** 탭에 빨간 에러가 없는지 확인해요.
- 휴대폰 화면도 확인하려면 개발자 도구의 📱 버튼(기기 모드)을 눌러 보세요.

## 4. 커밋하기

커밋은 "저장 지점"이에요. 의미 있는 단위로 나눠서 자주 커밋하면 좋아요.

```bash
git status                 # 뭐가 바뀌었는지 보기
git add game.js            # 커밋할 파일 고르기
git commit -m "적 색깔을 보라색으로 변경"
```

커밋 메시지는 **무엇을 왜 바꿨는지** 한 줄로 써요.
- 👍 `단단한 적의 점수를 25점에서 30점으로 올림`
- 👎 `수정`, `asdf`, `최종_진짜최종`

## 5. 푸시하고 Pull Request 만들기

```bash
git push -u origin feat/enemy-color
```

푸시하면 GitHub 저장소 페이지에 **"Compare & pull request"** 버튼이 떠요. 누르고:

1. 제목: 무엇을 했는지 한 줄로
2. 본문: 템플릿 칸을 채워요 (바꾼 내용, 확인한 방법, 스크린샷)
3. 관련 이슈가 있으면 본문에 `Closes #이슈번호` 를 쓰면, 머지될 때 이슈가 자동으로 닫혀요.
4. 오른쪽 **Reviewers** 에서 리뷰해 줄 사람을 지정해요.

## 6. 리뷰 주고받기

- 리뷰어는 **Files changed** 탭에서 코드 줄마다 댓글을 달 수 있어요.
- 수정 요청을 받으면 같은 브랜치에서 고치고 다시 `commit` → `push` 하면 PR에 자동으로 추가돼요.
- 리뷰는 사람이 아니라 코드에 대한 이야기예요. 궁금한 건 편하게 물어보세요! 🙂

## 7. 머지하고 정리하기

리뷰가 끝나면 **Merge pull request** 를 눌러 `main`에 합쳐요. 그다음 내 컴퓨터도 최신으로 맞춰요.

```bash
git switch main
git pull
git branch -d feat/enemy-color   # 다 쓴 브랜치 지우기
```

---

## 😱 충돌(conflict)이 났어요!

두 사람이 **같은 파일의 같은 줄**을 다르게 고치면 Git이 어느 쪽을 쓸지 몰라서 충돌이 나요. 정상이니 겁먹지 마세요.

```bash
git switch feat/enemy-color
git pull origin main        # main의 최신 내용을 내 브랜치로 가져오기
```

충돌난 파일을 열면 이렇게 표시돼 있어요.

```
<<<<<<< HEAD
ctx.fillStyle = '#a066ff';   ← 내가 바꾼 것
=======
ctx.fillStyle = '#ff5470';   ← main에 있는 것
>>>>>>> main
```

둘 중 맞는 걸 남기고(또는 둘을 합치고) `<<<<<<<`, `=======`, `>>>>>>>` 줄을 지운 뒤:

```bash
git add game.js
git commit -m "main과 충돌 해결"
git push
```

> 💡 충돌을 줄이는 팁: 작업을 작게 나누고, 시작하기 전에 `git pull` 하고, 서로 어떤 파일을 고치는지 이슈에 미리 적어 두기.

## 자주 쓰는 명령어 모음

| 명령어 | 뜻 |
| --- | --- |
| `git status` | 지금 상태 보기 (가장 많이 씀!) |
| `git log --oneline` | 커밋 기록 보기 |
| `git diff` | 아직 커밋 안 한 변경 내용 보기 |
| `git switch 브랜치` | 브랜치 이동 |
| `git restore 파일` | 커밋 안 한 변경 되돌리기 (조심!) |
