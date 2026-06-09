-- 학생 인식조사 결과 (학교 × 사전/사후별 1행)
-- 서버에서 service role로만 읽기/쓰기. RLS는 켜두고 공개 정책은 두지 않음(서비스롤이 우회).
-- Supabase SQL Editor에서 1회 실행하세요.

CREATE TABLE IF NOT EXISTS student_perception_results (
  school_name text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('pre', 'post')),
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by text,
  PRIMARY KEY (school_name, phase)
);

ALTER TABLE student_perception_results ENABLE ROW LEVEL SECURITY;
