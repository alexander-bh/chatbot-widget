import { useEffect } from "react"

export default function ChatbotEmbed() {
  useEffect(() => {
    const config = {
      apiBase: "https://your-api.com",
      publicId: "PUBLIC_ID",
      originDomain: window.location.origin,
      name: "Mi Chatbot",
      avatar: "/avatar.png",
      primaryColor: "#2563eb",
      secondaryColor: "#111827",
      inputPlaceholder: "Escribe un mensaje...",
      welcomeMessage: "Hola 👋 ¿En qué puedo ayudarte?",
      welcomeDelay: 2,
      showWelcomeOnMobile: true,
      position: "bottom-right"
    }

    const script = document.createElement("script")
    script.src = "/chatbot/embed.js"
    script.dataset.config = JSON.stringify(config)
    script.async = true

    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  return (
    <>
      <button className="chat-fab" id="chatToggle">
        <img id="chatAvatarFab" className="chat-avatar-fab" alt="Avatar" />
      </button>

      <div className="chat-welcome" id="chatWelcome">
        <span className="welcome-text"></span>
      </div>

      <div className="chat-widget" id="chatWidget">
        <div className="chat">
          <header className="chat-header">
            <img id="chatAvatarHeader" className="chat-avatar" alt="Avatar" />

            <div className="chat-header-info">
              <strong id="chatName">Chatbot</strong>
              <div className="chat-status" id="chatStatus">Offline</div>
            </div>

            <div className="chat-actions">
              <button id="chatRestart" className="chat-restart" aria-label="Reiniciar conversación">↻</button>
              <button className="chat-close" id="chatClose" aria-label="Cerrar">×</button>
            </div>
          </header>

          <main id="messages"></main>

          <footer>
            <input id="messageInput" autoComplete="off" />
            <button id="sendBtn" aria-label="Enviar mensaje">➤</button>
          </footer>
        </div>
      </div>
    </>
  )
}