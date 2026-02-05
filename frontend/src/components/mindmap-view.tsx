'use client'

import { useState, useCallback, useEffect } from 'react'
import {
    ReactFlow,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    ConnectionLineType,
    Node,
    Edge,
    ReactFlowProvider
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'

import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw } from 'lucide-react'
import api from '@/lib/api'

// Define the shape of our data from API
interface MindMapNodeData {
    id: string
    label: string
    type: string
}

interface MindMapEdgeData {
    source: string
    target: string
    label: string
}

const nodeWidth = 180
const nodeHeight = 60

/**
 * Layout helper using dagre
 */
const getLayoutedElements = (
    nodes: Node[],
    edges: Edge[],
    direction = 'LR'
) => {
    const dagreGraph = new dagre.graphlib.Graph()
    dagreGraph.setDefaultEdgeLabel(() => ({}))

    dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 100 })

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
    })

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target)
    })

    dagre.layout(dagreGraph)

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id)
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeHeight / 2
            }
        }
    })

    return { nodes: layoutedNodes, edges }
}

function MindMapInner({
    workspaceId,
    initialTopic = 'Key Concepts'
}: {
    workspaceId: number
    initialTopic?: string
}) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
    const [loading, setLoading] = useState(true)
    const [generated, setGenerated] = useState(false)

    // Process raw data into React Flow elements
    const processElements = useCallback(
        (rawNodes: MindMapNodeData[], rawEdges: MindMapEdgeData[]) => {
            const initialNodes: Node[] = rawNodes.map((n) => ({
                id: n.id,
                data: { label: n.label },
                position: { x: 0, y: 0 },
                style: {
                    background:
                        n.type === 'input'
                            ? 'rgb(59 130 246 / 0.10)'
                            : n.type === 'output'
                              ? 'rgb(16 185 129 / 0.10)'
                              : 'var(--card)',
                    border:
                        '1px solid ' +
                        (n.type === 'input'
                            ? 'rgb(59 130 246 / 0.65)'
                            : n.type === 'output'
                              ? 'rgb(16 185 129 / 0.65)'
                              : 'rgb(148 163 184 / 0.45)'),
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    width: nodeWidth,
                    textAlign: 'center' as const,
                    color: 'var(--foreground)'
                }
            }))

            const initialEdges: Edge[] = rawEdges.map((e, i) => ({
                id: `e${i}`,
                source: e.source,
                target: e.target,
                label: e.label,
                type: ConnectionLineType.Bezier,
                style: { stroke: '#94a3b8', strokeWidth: 2 },
                animated: true
            }))

            const { nodes: layoutedNodes, edges: layoutedEdges } =
                getLayoutedElements(initialNodes, initialEdges)

            setNodes(layoutedNodes)
            setEdges(layoutedEdges)
            setGenerated(true)
        },
        [setNodes, setEdges]
    )

    const generateMindMap = useCallback(async () => {
        setLoading(true)
        try {
            const res = await api.post('/generate/mindmap', {
                topic: initialTopic,
                workspace_id: workspaceId
            })
            processElements(res.data.nodes, res.data.edges)
        } catch (e) {
            console.error('Error generating mindmap:', e)
        } finally {
            setLoading(false)
        }
    }, [workspaceId, initialTopic, processElements])

    // Auto-load if exists
    useEffect(() => {
        let mounted = true
        const fetchExisting = async () => {
            try {
                const res = await api.get('/generate/existing', {
                    params: { workspace_id: workspaceId, topic: initialTopic }
                })
                if (!mounted) return
                if (res.data.mindmap) {
                    processElements(
                        res.data.mindmap.nodes,
                        res.data.mindmap.edges
                    )
                }
            } catch (e) {
                console.error('Error fetching existing mindmap:', e)
            } finally {
                if (mounted) setLoading(false)
            }
        }

        setGenerated(false)
        setNodes([])
        setEdges([])
        setLoading(true)
        fetchExisting()

        return () => {
            mounted = false
        }
    }, [workspaceId, initialTopic, processElements, setNodes, setEdges])

    if (!generated && !loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
                <h3 className="text-xl font-semibold">AI Mind Map</h3>
                <p className="text-slate-500">
                    Visualize concepts and their relationships using React Flow.
                </p>
                <Button onClick={generateMindMap}>Generate Mind Map</Button>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col relative bg-background">
            <div className="p-4 border-b border-border flex justify-between items-center bg-card/60 backdrop-blur-md z-10">
                <h2 className="font-bold text-lg">Mind Map: {initialTopic}</h2>
                <Button variant="outline" size="sm" onClick={generateMindMap}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
                </Button>
            </div>

            <div className="flex-1 w-full h-full">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    connectionLineType={ConnectionLineType.Bezier}
                    proOptions={{ hideAttribution: true }}
                    fitView
                >
                    <Background color="rgb(148 163 184 / 0.35)" gap={20} />
                    <Controls showInteractive={false} />
                </ReactFlow>
            </div>
        </div>
    )
}

export default function MindMapView(props: {
    workspaceId: number
    initialTopic?: string
}) {
    return (
        <ReactFlowProvider>
            <MindMapInner {...props} />
        </ReactFlowProvider>
    )
}
