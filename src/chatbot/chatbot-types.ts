// src/chatbot/chatbot-types.ts

export interface FlowBundle {
    chatbot_id: string
    chatbot_name: string
    start_node_id: string
    flow_id: string
    nodes: BundleNode[]
}

export interface BundleNode {
    _id: string
    node_type: string
    content?: string
    typing_time?: number
    end_conversation?: boolean
    next_node_id?: string | null
    branch_id?: string | null
    variable_key?: string | null
    validation?: {
        min_length?: number
        min?: number
        max?: number
        message?: string
    } | null
    options?: {
        label: string
        value: string
        next_node_id?: string | null
        next_branch_id?: string | null
    }[]
    policy?: {
        label: string
        value: string
        next_node_id?: string | null
        next_branch_id?: string | null
    }[]
    link_actions?: {
        type: "link" | "email" | "phone" | "whatsapp"
        title?: string
        value: string
        new_tab?: boolean
    }[]
    media?: { type: "image" | "video"; url: string }[]
    auto_next?: boolean
}

export interface EnginePayload {
    history: { node_id: string; question?: string; answer: string }[]
    variables: Record<string, string>
    flow_id: string
}