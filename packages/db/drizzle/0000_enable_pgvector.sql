-- 启用 pgvector（灵感库向量检索 / 去重 / RAG）。需要 pgvector/pgvector:pg16 镜像或已安装扩展的 Postgres。
CREATE EXTENSION IF NOT EXISTS vector;
