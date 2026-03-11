import { useEffect, useState } from "react"
import { useChatbot } from "./useChatbot"
import type { ChatbotConfig } from "./useChatbot"
import "./chatbot.css"

export default function ChatbotWidget() {
    const [config, setConfig] = useState<ChatbotConfig | null>(null)
    const [error, setError] = useState<string | null>(null)

    /* ===============================
       🔐 1. Leer config desde URL
    =============================== */
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const params = new URLSearchParams(window.location.search)
                const encoded = params.get("config")
                if (!encoded) throw new Error("Missing config")
                const decoded = JSON.parse(atob(decodeURIComponent(encoded)))

                const payload = JSON.parse(decoded.payload)

                const res = await fetch(`${payload.apiBase}/api/chatbot-integration/config/verify`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(decoded)
                })

                if (!res.ok) throw new Error("Firma inválida")

                const verifiedConfig = await res.json()
                setConfig(verifiedConfig)

            } catch (err) {
                console.error(err)
                setError("No se pudo cargar el chatbot")
            }
        }

        loadConfig()
    }, [])

    /* ===============================
       ⛔ Estados de carga
    =============================== */
    if (error) return null
    if (!config) return null

    /* ===============================
       🚀 Widget normal
    =============================== */
    const {
        messagesRef,
        inputRef,
        isOpen,
        statusText,
        inputDisabled,
        sendDisabled,
        welcomeVisible,
        viewerOpen,
        viewerUrl,
        viewerIsVideo,
        toggle,
        close,
        send,
        restart,
        closeViewer,
    } = useChatbot(config)

    return (
        <>
            {welcomeVisible && (
                <div className={`chat-welcome show`}>
                    <span className="welcome-text">{config.welcomeMessage}</span>
                </div>
            )}

            <button
                className={`chat-fab${isOpen ? " active" : ""}`}
                onClick={toggle}
                aria-label="Abrir chat"
            >
                <img className="chat-avatar-fab" src={config.avatar} alt={config.name} />
            </button>

            <div className={`chat-widget${isOpen ? " open" : ""}`}>
                <div className="chat">
                    <header className="chat-header">
                        <img className="chat-avatar" src={config.avatar} alt={config.name} />
                        <div className="chat-header-info">
                            <strong>{config.name}</strong>
                            <div className="chat-status">{statusText}</div>
                        </div>
                        <div className="chat-actions">
                            <button className="chat-restart" onClick={restart} aria-label="Reiniciar conversación">↻</button>
                            <button className="chat-close" onClick={close} aria-label="Cerrar chat">×</button>
                        </div>
                    </header>

                    <main ref={messagesRef} />

                    <footer>
                        <input
                            ref={inputRef}
                            type="text"
                            autoComplete="off"
                            placeholder={config.inputPlaceholder}
                            disabled={inputDisabled}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault()
                                    send()
                                }
                            }}
                        />
                        <button onClick={() => send()} disabled={sendDisabled} aria-label="Enviar">➤</button>
                    </footer>
                </div>
            </div>

            <div
                className={`chat-image-viewer${viewerOpen ? " open" : ""}`}
                onClick={(e) => { if (e.target === e.currentTarget) closeViewer() }}
            >
                <span className="viewer-close" onClick={closeViewer}>✕</span>
                {viewerIsVideo
                    ? <video className="viewer-video" src={viewerUrl} controls playsInline autoPlay />
                    : <img className="viewer-img" src={viewerUrl} alt="preview" />
                }
            </div>
        </>
    )
}