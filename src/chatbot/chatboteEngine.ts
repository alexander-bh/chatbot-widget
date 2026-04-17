import type { FlowBundle, BundleNode, EnginePayload } from "./chatbot-types"

export class ChatbotEngine {
    chatbotName: string
    startNodeId: string
    flowId: string
    nodesMap: Map<string, BundleNode>
    variables: Record<string, string>
    history: { node_id: string; question?: string; answer: string }[]
    currentBranchId: string | null
    completed: boolean
    abandoned: boolean
    private _currentNodeId: string | undefined

    constructor(bundle: FlowBundle) {
        this.chatbotName = bundle.chatbot_name
        this.startNodeId = bundle.start_node_id
        this.flowId = bundle.flow_id
        this.nodesMap = new Map(bundle.nodes.map(n => [n._id, n]))
        this.variables = {}
        this.history = []
        this.currentBranchId = null
        this.completed = false
        this.abandoned = false
    }

    start(): BundleNode | null {
        const startNode = this.nodesMap.get(this.startNodeId)
        if (!startNode) throw new Error("Nodo inicial no encontrado")
        return this._autoFlow(startNode)
    }

    _autoAdvanceFrom(node: BundleNode): BundleNode | null {
        const next = this._getNext(node.next_node_id ?? null)
        if (next) this._currentNodeId = next._id
        return next
    }

    next(input: string): BundleNode | null {
        if (this.completed || this.abandoned) return null

        const node = this._currentNodeId ? this.nodesMap.get(this._currentNodeId) : undefined
        if (!node) { this.completed = true; return null }

        const result = this._resolveInput(node, input)

        if (result.validation_error) throw result

        const nextNode = result.node
        if (!nextNode) { this.completed = true; return null }

        if (!nextNode._id) {
            if (nextNode.end_conversation) {
                if (!this.abandoned) this.completed = true
            }
            return nextNode
        }

        return this._autoFlow(nextNode)
    }

    getPayload(): EnginePayload {
        return {
            history: this.history,
            variables: this.variables,
            flow_id: this.flowId
        }
    }

    private _resolveInput(node: BundleNode, input: string): {
        node: BundleNode | null
        validation_error?: boolean
        message?: string
        field?: string
    } {
        const INPUT_NODES = ["question", "email", "phone", "number"]
        const INTERACTION_NODES = ["options", "policy"]

        if (INPUT_NODES.includes(node.node_type)) {
            const error = this._validateInput(node, input)
            if (error) return { node: null, validation_error: true, message: error, field: node.node_type }

            this.history.push({ node_id: node._id, question: node.content, answer: input })
            if (node.variable_key) this.variables[node.variable_key] = input

            return { node: this._getNext(node.next_node_id ?? null) }
        }

        if (INTERACTION_NODES.includes(node.node_type)) {
            const source = node.node_type === "options" ? node.options : node.policy
            const match = source?.find(
                o => String(o.value).toLowerCase() === String(input).toLowerCase() ||
                    String(o.label).toLowerCase() === String(input).toLowerCase()
            )
            if (!match) return { node }

            this.history.push({ node_id: node._id, question: node.content, answer: match.label })

            if (node.node_type === "policy") {
                let consent = match.value
                if (consent.toUpperCase() === "SI") consent = "accepted"
                if (consent.toUpperCase() === "NO") consent = "rejected"
                this.variables.data_processing_consent = consent

                if (consent === "rejected") {
                    this.abandoned = true
                    return {
                        node: {
                            _id: "",
                            node_type: "text",
                            content: "No podemos continuar sin aceptar nuestras políticas de tratamiento de datos.",
                            typing_time: 1,
                            end_conversation: true
                        }
                    }
                }
            }

            this.currentBranchId = match.next_branch_id ?? null
            return { node: this._getNext(match.next_node_id ?? null) }
        }

        return { node: this._getNext(node.next_node_id ?? null) }
    }

    private _autoFlow(node: BundleNode): BundleNode | null {
        const INPUT_NODES = ["question", "email", "phone", "number"]
        const INTERACTION_NODES = ["options", "policy"]
        let safety = 0

        while (node && safety++ < 20) {
            this._currentNodeId = node._id

            if (INPUT_NODES.includes(node.node_type) || INTERACTION_NODES.includes(node.node_type)) {
                return node
            }
            if (node.end_conversation) {
                this.completed = true
                return node
            }
            if (["text", "media", "link"].includes(node.node_type)) {
                return node
            }
            const next = this._getNext(node.next_node_id ?? null)
            if (!next) break
            node = next
        }
        this.completed = true
        return null
    }

    private _getNext(next_node_id: string | null | undefined): BundleNode | null {
        if (!next_node_id) return null
        const candidate = this.nodesMap.get(String(next_node_id))
        if (!candidate) return null
        if (candidate.branch_id && candidate.branch_id !== this.currentBranchId) return null
        return candidate
    }

    private _validateInput(node: BundleNode, input: string): string | null {
        if (!input && (input as unknown) !== 0) return "Este campo es obligatorio."

        const val = node.validation as any
        if (!val) return null

        // ── Formato NUEVO (plano): { min_length, min, max, message } ──────────
        if (!val.rules) {
            if (node.node_type === "email") {
                const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input).trim())
                if (!ok) return val.message || "Correo inválido."
            }
            if (node.node_type === "phone") {
                const digits = String(input).replace(/\D/g, "")
                if (digits.length < 7) return val.message || "Teléfono inválido."
            }
            if (node.node_type === "number") {
                const n = Number(input)
                if (isNaN(n)) return val.message || "Debe ser un número."
                if (val.min != null && n < val.min) return val.message || `Mínimo ${val.min}.`
                if (val.max != null && n > val.max) return val.message || `Máximo ${val.max}.`
            }
            if (node.node_type === "question" && val.min_length) {
                if (String(input).trim().length < val.min_length)
                    return val.message || `Mínimo ${val.min_length} caracteres.`
            }
            return null
        }

        if (!val.enabled || !val.rules?.length) return null

        const value = String(input ?? "").trim()

        for (const rule of val.rules) {
            switch (rule.type) {
                case "required":
                    if (!value.length) return rule.message
                    break
                case "email":
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
                        return rule.message
                    break
                case "phone": {
                    const phone = value.replace(/[^\d+]/g, "")
                    if (!/^\+?\d{7,15}$/.test(phone)) return rule.message
                    break
                }
                case "phone_mx": {
                    const phone = value.replace(/[^\d+]/g, "")
                    if (!/^\+?52\d{10}$/.test(phone)) return rule.message
                    break
                }
                case "phone_country":
                    if (!/^\+\d{1,3}/.test(value)) return rule.message
                    break
                case "integer":
                    if (!/^-?\d+$/.test(value)) return rule.message
                    break
                case "decimal":
                    if (!/^-?\d+(\.\d+)?$/.test(value)) return rule.message
                    break
                case "number":
                    if (isNaN(Number(value))) return rule.message
                    break
                case "MinMax": {
                    if (node.node_type === "question") {
                        const words = value.split(/\s+/).filter(Boolean).length
                        if (
                            (rule.min !== undefined && words < rule.min) ||
                            (rule.max !== undefined && words > rule.max)
                        ) return rule.message
                    }
                    if (node.node_type === "number") {
                        const num = Number(value)
                        if (
                            isNaN(num) ||
                            (rule.min !== undefined && num < rule.min) ||
                            (rule.max !== undefined && num > rule.max)
                        ) return rule.message
                    }
                    break
                }
            }
        }
        return null
    }

    getCurrentNodeId(): string | undefined {
        return this._currentNodeId
    }

    getState(): { nodeId: string | undefined; variables: Record<string, string>; history: any[] } {
        return {
            nodeId: this._currentNodeId,
            variables: this.variables,
            history: this.history
        }
    }

    restoreState(nodeId: string, variables?: Record<string, string>, history?: any[]) {
        this._currentNodeId = nodeId
        if (variables) this.variables = variables
        if (history) this.history = history
    }

    getCurrentNode(): BundleNode | undefined {
        if (!this._currentNodeId) return undefined
        return this.nodesMap.get(this._currentNodeId!)
    }

    // Agregar snapshot antes de next(), para poder revertir
    private _snapshot: {
        nodeId: string | undefined
        variables: Record<string, string>
        history: { node_id: string; question?: string; answer: string }[]
        branchId: string | null
    } | null = null

    saveSnapshot() {
        this._snapshot = {
            nodeId: this._currentNodeId,
            variables: { ...this.variables },
            history: [...this.history],
            branchId: this.currentBranchId
        }
    }

    rollback() {
        if (!this._snapshot) return
        this._currentNodeId = this._snapshot.nodeId
        this.variables = { ...this._snapshot.variables }
        this.history = [...this._snapshot.history]
        this.currentBranchId = this._snapshot.branchId
        this.completed = false
        this.abandoned = false
        this._snapshot = null
    }
}