import { HfPreset } from '@/types'

export const HF_EMBEDDING_PRESETS: HfPreset[] = [
    {
        id: 'sentence-transformers/all-MiniLM-L6-v2',
        name: 'Fast & Lightweight',
        desc: 'Good for quick processing on standard PCs',
        dim: 384,
        size: 'Approx. 80MB'
    },
    {
        id: 'BAAI/bge-small-en-v1.5',
        name: 'High-Performance Small',
        desc: 'Excellent accuracy for its size',
        dim: 384,
        size: 'Approx. 130MB'
    },
    {
        id: 'sentence-transformers/all-mpnet-base-v2',
        name: 'Balanced (Recommended)',
        desc: 'The industry standard for document retrieval',
        dim: 768,
        size: 'Approx. 420MB'
    },
    {
        id: 'BAAI/bge-base-en-v1.5',
        name: 'Advanced Accuracy',
        desc: 'Slower to download but very precise',
        dim: 768,
        size: 'Approx. 440MB'
    },
    {
        id: 'BAAI/bge-large-en-v1.5',
        name: 'High Quality Large',
        desc: 'Maximum accuracy for complex documents',
        dim: 1024,
        size: 'Approx. 1.3GB',
        warn: 'Heavy model: may be slow on CPU and can fail if you run out of RAM. Recommended: GPU (CUDA) or plenty of system memory.'
    }
]
