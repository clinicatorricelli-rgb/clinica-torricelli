# Prévia temporária no celular — 04/11/2026

Servidor de demonstração Vite iniciado com `--host 0.0.0.0 --port 5173 --strictPort`, sem publicar na internet. Endereço atual: http://192.168.15.16:5173/ . Computador conectado por Ethernet à rede privada; o celular precisa estar no Wi-Fi do mesmo roteador/rede local, sem isolamento de convidados.

Verificado neste computador: HTTP 200 em `127.0.0.1:5173`, `192.168.15.16:5173` e no vídeo v2 pelo endereço de rede. Listener IPv4 em 0.0.0.0:5173. Sem `.env` ou `.env.local`; demonstração sem backend configurado. Nenhuma credencial na URL. Nenhuma regra de firewall ou roteador alterada, sem túnel público.

O firewall do Windows no perfil Private está ativo. Resposta ao próprio IP não comprova entrada a partir do telefone; isso depende de teste no celular. Se não abrir, verificar mesma rede, ausência de Wi-Fi de convidados/VPN e eventual aviso do Windows para permitir Node apenas em rede privada. Não desativar o firewall nem permitir redes públicas; eventual regra deve ser limitada à porta TCP 5173, perfil privado e sub-rede local. Nenhum bloqueio específico foi comprovado nesta preparação.

Prévia de desenvolvimento, somente para rede confiável enquanto revisam. Não contém dados reais. Endereço pode mudar com DHCP; computador e servidor devem permanecer ligados. Encerrar o processo Vite desta prévia após a revisão. Para reiniciar, executar o comando acima no projeto. O endereço não funciona fora da rede local.
