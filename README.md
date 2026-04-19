# ARES

**Agentic Research Experimentation System**

연구 아이디어를 논문 탐색에서 끝내지 않고, 재현, 실험, 인사이트, 문서화까지 이어지게 만드는 에이전트 기반 연구 실행 워크스페이스

![ARES prototype preview](design/screenshots/current.png)

## Overview

ARES는 AI/ML 연구자가 다음 흐름을 하나의 연속된 작업 공간에서 수행할 수 있도록 설계된 제품이다.

`Search -> Reading -> Research -> Result -> Insight -> Writing`

기존 도구들이 논문 탐색, 북마크, 요약에 머무르는 경우가 많다면, ARES는 그 다음 단계인 재현 준비, 실험 비교, 인사이트 축적, 후속 연구 가설 정리까지 연결하는 데 초점을 둔다.

핵심 목표는 다음과 같다.

- 논문을 "읽는 대상"에서 "실험 가능한 지식"으로 전환
- 재현 실패와 성능 편차를 후속 연구의 단서로 자산화
- 반복적인 연구 워크플로우를 에이전트 협업 구조로 정리

## Product Direction

ARES는 현재 다음 6단계 워크플로우를 중심으로 설계되어 있다.

### 1. Search

연구 주제에 맞는 논문을 탐색하고, 필터링하고, 저장하거나 다음 단계로 보낸다.

### 2. Reading

논문을 섹션 단위로 읽고, 핵심 주장, 결과, 한계, 재현 파라미터를 구조화한다.

### 3. Research

재현 체크리스트를 관리하고, baseline 및 ablation 실험을 설계한다.

### 4. Result

원 논문 수치와 재현 결과를 비교하고, delta와 차이 원인을 분석한다.

### 5. Insight

실험 결과를 연구 인사이트와 후속 연구 가설로 정리한다.

### 6. Writing

축적된 결과를 바탕으로 리포트나 논문 초안을 작성한다.

## Agent Model

ARES는 역할 기반 에이전트 구조를 전제로 설계되어 있다.

- `Scout Agent`: 논문 탐색과 큐 구성
- `Reader Agent`: 구조화 리딩과 재현 정보 추출
- `Reproduction Agent`: 코드/환경/체크리스트 분석
- `Experiment Agent`: 실험안 생성과 실험 큐 관리
- `Analyst Agent`: 결과 차이 해석과 인사이트 도출
- `Proposal / Writing Assistant`: 후속 가설과 문서 초안 생성

## Current Status

이 저장소는 아직 실제 제품 구현 단계에 들어가기 전의 **프로토타입 및 문서 설계 저장소**다.

현재 포함된 내용:

- 인터랙션이 반영된 HTML 프로토타입
- 와이어프레임
- 제품 비전 문서
- 프로토타입 기준 기능 명세 문서

아직 포함되지 않은 내용:

- 프론트엔드 애플리케이션 코드
- 백엔드 서비스
- 실제 에이전트 실행 인프라
- 실험 실행 파이프라인

즉, 현재 단계의 목적은 **UI/UX 설계를 마무리하고, 제품 명세를 정렬한 뒤, 실제 구현으로 진입할 준비를 하는 것**이다.

## Repository Structure

```text
ARES/
├── design/
│   ├── ARES Prototype.html
│   ├── ARES Wireframes.html
│   └── screenshots/
├── docs/
│   ├── product vision.md
│   ├── specification.md
│   ├── 구현 기획서.md
│   └── 구현 기획서 - 원본.md
└── README.md
```

## Key Documents

- [Prototype](design/ARES%20Prototype.html)
  - 현재 UI/UX의 가장 구체적인 기준안
- [Wireframes](design/ARES%20Wireframes.html)
  - 초기 구조와 화면 흐름 참고용
- [Specification](docs/specification.md)
  - 프로토타입 기준으로 정렬된 기능 명세 문서
- [Product Vision](docs/product%20vision.md)
  - 제품의 문제 정의, 비전, 사용자 가치

## How To Review The Prototype

현재는 별도 개발 서버가 없다. 가장 간단한 확인 방법은 아래와 같다.

1. `design/ARES Prototype.html`을 브라우저에서 연다.
2. 전체 워크플로우를 순서대로 점검한다.
3. 화면별로 다음을 본다.
   - 정보 구조가 자연스러운지
   - 다음 단계 행동이 명확한지
   - 상태 표현이 충분한지
   - 에이전트 역할이 UI에 잘 드러나는지

## Design Principles

ARES는 다음 원칙을 중심으로 설계한다.

- 연구 흐름이 끊기지 않아야 한다.
- 각 단계는 다음 행동으로 자연스럽게 이어져야 한다.
- 실패와 편차는 버릴 데이터가 아니라 연구 자산이어야 한다.
- 에이전트는 숨겨진 자동화가 아니라 사용자와 협업하는 주체로 보여야 한다.
- UI는 논문 관리 도구가 아니라 연구 실행 워크스페이스처럼 느껴져야 한다.

## Next Step

현재 우선순위는 다음과 같다.

1. 프로토타입에서 UI/UX 설계를 마무리한다.
2. 기능 명세와 화면 설계를 정렬한다.
3. 실제 구현 범위를 확정한다.
4. 프론트엔드와 백엔드 아키텍처를 설계한다.
5. 구현을 시작한다.

## Notes

- 프로토타입과 문서가 충돌할 경우, 당분간은 프로토타입 구현을 우선 기준으로 본다.
- 기존 비전 문서와 현재 기능 명세 문서는 분리해 유지한다.
- 이 저장소는 "아이디어 메모"가 아니라 실제 제품 설계 자산을 축적하는 공간으로 운영한다.
