# Auto SLA

Um sistema simples para geração automatizada de relatórios de SLA em formato Word (.docx).

## Como Instalar

1. Certifique-se de ter o [Node.js](https://nodejs.org/) instalado em seu computador.
2. Na primeira vez, clique duas vezes no arquivo `instalar_dependencias.bat` (que vamos criar) ou abra um terminal na pasta e rode `npm install`.

## Como preparar o seu Template Word

Para que o sistema consiga preencher os dados automaticamente, você precisa abrir o seu arquivo Word de modelo (ex: `05 Mai. SLA Perto.docx`), **Salvar Como** `template_sla.docx` e colocar este arquivo na mesma pasta do sistema.

Dentro do Word, você deve substituir os textos fixos por "Tags" que o sistema vai reconhecer e substituir:

1. **Logo do Cliente**: Onde a logo da Perto / Transpinho fica no documento (no cabeçalho ou topo), delete a imagem atual e digite exatamente `{%logo}`.
2. **Mês**: Onde está "Mai/26" ou "MAIO/2026", troque por `{mes}`.
3. **Total de Rotas**: Onde está "1771", troque por `{total_rotas}`.
4. **Ocorrências**: Onde está "2" no total, troque por `{ocorrencias}`.
5. **Meta Percentual**: Onde está "99,89%", troque por `{meta}`.
6. **Nível de Serviço**: Onde está "Excelência...", troque por `{nivel}`.

### Tabela de Detalhamento de Ocorrências
Na tabela final onde são listadas as ocorrências 060, 061, etc. Você deve apagar as linhas antigas e deixar apenas uma linha de "modelo" para o sistema multiplicar.
A linha deve ficar assim:
| Nº | Data | Descrição da Ocorrência | Status / Resolução |
|----|------|-------------------------|--------------------|
| {#lista_ocorrencias}{numero} | {data} | {descricao} | {status}{/lista_ocorrencias} |

Isso dirá ao sistema para criar uma linha nova na tabela para cada ocorrência que você adicionar na interface!

## Como Usar

1. Dê um clique duplo no arquivo `iniciar.bat`.
2. Seu navegador vai abrir automaticamente na página `http://localhost:3000`.
3. Preencha os dados, selecione a imagem da logo, e clique em "Gerar SLA". O PDF/Docx será baixado na hora!
