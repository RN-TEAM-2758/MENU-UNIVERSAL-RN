-- [[ SERVIÇOS ]]
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")
local LocalPlayer = Players.LocalPlayer

-- [[ TEMA ]]
local Theme = {
    Main = Color3.fromRGB(15, 15, 22),
    Secondary = Color3.fromRGB(25, 25, 38),
    Accent = Color3.fromRGB(0, 255, 150),
    Text = Color3.fromRGB(240, 240, 240),
    Button = Color3.fromRGB(35, 35, 45),
    Hover = Color3.fromRGB(50, 50, 65)
}

-- [[ VARIÁVEIS DE ESTADO E LÓGICA ]]
local DropdownSignals = {}
local function GetPathFromString(str)
    local success, result = pcall(function()
        local path = game
        for segment in string.gmatch(str, "[^%.]+") do
            path = path[segment]
        end
        return path
    end)
    return success and result or nil
end

-- [[ ESTRUTURA DA GUI ]]
local ScreenGui = Instance.new("ScreenGui", LocalPlayer:WaitForChild("PlayerGui"))
ScreenGui.Name = "RN_TEAM_ULTIMATE"
ScreenGui.ResetOnSpawn = false

local MainFrame = Instance.new("Frame", ScreenGui)
MainFrame.Size = UDim2.new(0, 550, 0, 420)
MainFrame.Position = UDim2.new(0.5, -275, 0.5, -210)
MainFrame.BackgroundColor3 = Theme.Main
MainFrame.Visible = false
MainFrame.ClipsDescendants = false
Instance.new("UICorner", MainFrame).CornerRadius = UDim.new(0, 10)

local SideBar = Instance.new("Frame", MainFrame)
SideBar.Size = UDim2.new(0, 150, 1, 0)
SideBar.BackgroundColor3 = Theme.Secondary
Instance.new("UICorner", SideBar).CornerRadius = UDim.new(0, 10)

local SideTitle = Instance.new("TextLabel", SideBar)
SideTitle.Size = UDim2.new(1, 0, 0, 60); SideTitle.Text = "RN TEAM"; SideTitle.Font = Enum.Font.GothamBold
SideTitle.TextColor3 = Theme.Accent; SideTitle.TextSize = 22; SideTitle.BackgroundTransparency = 1

local TabContainer = Instance.new("Frame", SideBar)
TabContainer.Size = UDim2.new(1, 0, 1, -70); TabContainer.Position = UDim2.new(0, 0, 0, 60); TabContainer.BackgroundTransparency = 1
Instance.new("UIListLayout", TabContainer).Padding = UDim.new(0, 5)
TabContainer.UIListLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center

local Pages = Instance.new("Frame", MainFrame)
Pages.Size = UDim2.new(1, -170, 1, -20); Pages.Position = UDim2.new(0, 160, 0, 10); Pages.BackgroundTransparency = 1
Pages.ClipsDescendants = true

local FloatingBtn = Instance.new("TextButton", ScreenGui)
FloatingBtn.Size = UDim2.new(0, 55, 0, 55); FloatingBtn.Position = UDim2.new(0.05, 0, 0.2, 0)
FloatingBtn.BackgroundColor3 = Theme.Accent; FloatingBtn.Text = "RN"; FloatingBtn.Font = Enum.Font.GothamBold
FloatingBtn.TextColor3 = Theme.Main; FloatingBtn.TextSize = 20; Instance.new("UICorner", FloatingBtn).CornerRadius = UDim.new(1, 0)

-- [[ FUNÇÕES DE UI ]]
local function CloseAllDropdowns()
    for _, func in pairs(DropdownSignals) do func() end
end

function CreateSection(parent, text)
    local sectionFrame = Instance.new("Frame", parent)
    sectionFrame.Size = UDim2.new(0.98, 0, 0, 40)
    sectionFrame.BackgroundColor3 = Theme.Secondary
    sectionFrame.ClipsDescendants = true
    Instance.new("UICorner", sectionFrame).CornerRadius = UDim.new(0, 8)
    
    local sectionBtn = Instance.new("TextButton", sectionFrame)
    sectionBtn.Size = UDim2.new(1, 0, 0, 40)
    sectionBtn.BackgroundColor3 = Theme.Button
    sectionBtn.Text = "▼ " .. text
    sectionBtn.TextColor3 = Theme.Accent
    sectionBtn.Font = Enum.Font.GothamBold
    sectionBtn.TextSize = 14
    Instance.new("UICorner", sectionBtn).CornerRadius = UDim.new(0, 8)

    local container = Instance.new("Frame", sectionFrame)
    container.Name = "Container"
    container.Position = UDim2.new(0, 0, 0, 45)
    container.Size = UDim2.new(1, 0, 0, 0)
    container.BackgroundTransparency = 1
    local layout = Instance.new("UIListLayout", container)
    layout.Padding = UDim.new(0, 8)
    layout.HorizontalAlignment = Enum.HorizontalAlignment.Center

    local isOpen = false
    local function UpdateSize()
        local targetSize = isOpen and (layout.AbsoluteContentSize.Y + 55) or 40
        TweenService:Create(sectionFrame, TweenInfo.new(0.3), {Size = UDim2.new(0.98, 0, 0, targetSize)}):Play()
    end

    sectionBtn.MouseButton1Click:Connect(function()
        isOpen = not isOpen
        sectionBtn.Text = (isOpen and "▲ " or "▼ ") .. text
        UpdateSize()
    end)
    layout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
        if isOpen then UpdateSize() end
    end)
    return container
end

function CreateLabel(parent, text)
    local label = Instance.new("TextLabel", parent)
    label.Size = UDim2.new(0.95, 0, 0, 25); label.BackgroundTransparency = 1
    label.Text = text; label.TextColor3 = Theme.Accent; label.Font = Enum.Font.GothamBold; label.TextSize = 13
end

local function CreatePage(name)
    local page = Instance.new("ScrollingFrame", Pages)
    page.Name = name; page.Size = UDim2.new(1, 0, 1, 0); page.BackgroundTransparency = 1
    page.Visible = false; page.ScrollBarThickness = 0
    page.CanvasSize = UDim2.new(0,0,0,0); page.AutomaticCanvasSize = Enum.AutomaticSize.Y
    local layout = Instance.new("UIListLayout", page)
    layout.Padding = UDim.new(0, 10); layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
    page:GetPropertyChangedSignal("CanvasPosition"):Connect(CloseAllDropdowns)
    return page
end

local function AddTab(name, pageObj)
    local btn = Instance.new("TextButton", TabContainer)
    btn.Size = UDim2.new(0.9, 0, 0, 35); btn.BackgroundColor3 = Theme.Button; btn.Text = name; btn.TextColor3 = Theme.Text
    Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 6)
    btn.MouseButton1Click:Connect(function()
        CloseAllDropdowns()
        for _, p in pairs(Pages:GetChildren()) do if p:IsA("ScrollingFrame") then p.Visible = false end end
        pageObj.Visible = true
    end)
end

function CreateButton(parent, text, callback)
    local btn = Instance.new("TextButton", parent)
    btn.Size = UDim2.new(0.95, 0, 0, 35); btn.BackgroundColor3 = Theme.Button; btn.Text = text
    btn.TextColor3 = Theme.Text; btn.Font = Enum.Font.GothamBold; btn.TextSize = 13
    Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 8)
    btn.MouseButton1Click:Connect(callback)
end

function CreateToggle(parent, text, default, callback)
    local tFrame = Instance.new("TextButton", parent)
    tFrame.Size = UDim2.new(0.95, 0, 0, 35); tFrame.BackgroundColor3 = Theme.Button; tFrame.Text = "  " .. text
    tFrame.TextColor3 = Theme.Text; tFrame.TextXAlignment = Enum.TextXAlignment.Left; tFrame.Font = Enum.Font.Gotham; tFrame.TextSize = 13
    Instance.new("UICorner", tFrame).CornerRadius = UDim.new(0, 8)
    local ind = Instance.new("Frame", tFrame)
    ind.Size = UDim2.new(0, 26, 0, 14); ind.Position = UDim2.new(1, -35, 0.5, -7); ind.BackgroundColor3 = default and Theme.Accent or Color3.fromRGB(60,60,70)
    Instance.new("UICorner", ind).CornerRadius = UDim.new(1, 0)
    local state = default
    tFrame.MouseButton1Click:Connect(function()
        state = not state
        ind.BackgroundColor3 = state and Theme.Accent or Color3.fromRGB(60,60,70)
        callback(state)
    end)
end

function CreateTextBox(parent, text, placeholder, callback)
    local base = Instance.new("Frame", parent)
    base.Size = UDim2.new(0.95, 0, 0, 35); base.BackgroundTransparency = 1
    local label = Instance.new("TextLabel", base)
    label.Size = UDim2.new(0.4, 0, 1, 0); label.Text = text; label.TextColor3 = Theme.Text; label.BackgroundTransparency = 1; label.TextXAlignment = Enum.TextXAlignment.Left; label.TextSize = 11
    local box = Instance.new("TextBox", base)
    box.Size = UDim2.new(0.55, 0, 0, 28); box.Position = UDim2.new(0.45, 0, 0.5, -14); box.BackgroundColor3 = Theme.Button
    box.Text = ""; box.PlaceholderText = placeholder; box.TextColor3 = Theme.Text; box.Font = Enum.Font.Gotham; box.TextSize = 12
    Instance.new("UICorner", box).CornerRadius = UDim.new(0, 6)
    box.FocusLost:Connect(function(enter) if enter then callback(box.Text) end end)
end

function CreateDropdown(parent, text, options, callback)
    local dropContainer = Instance.new("Frame", parent)
    dropContainer.Size = UDim2.new(0.95, 0, 0, 35); dropContainer.BackgroundTransparency = 1; dropContainer.ZIndex = 20
    local dropBtn = Instance.new("TextButton", dropContainer)
    dropBtn.Size = UDim2.new(1, 0, 0, 35); dropBtn.BackgroundColor3 = Theme.Button; dropBtn.Text = text .. " : Selecionar"
    dropBtn.TextColor3 = Theme.Text; dropBtn.ZIndex = 21; Instance.new("UICorner", dropBtn).CornerRadius = UDim.new(0, 8)
    local listFrame = Instance.new("ScrollingFrame", dropContainer)
    listFrame.Position = UDim2.new(0, 0, 0, 40); listFrame.Size = UDim2.new(1, 0, 0, 0); listFrame.BackgroundColor3 = Theme.Secondary
    listFrame.Visible = false; listFrame.ZIndex = 30; listFrame.BorderSizePixel = 0; listFrame.ScrollBarThickness = 0
    Instance.new("UIListLayout", listFrame)
    local isOpen = false
    local function toggle(forceClose)
        isOpen = forceClose ~= nil and false or not isOpen
        listFrame.Visible = isOpen
        local listHeight = isOpen and math.min(#options*32, 130) or 0
        listFrame.Size = UDim2.new(1, 0, 0, listHeight)
        dropContainer.Size = UDim2.new(0.95, 0, 0, 35 + (isOpen and (listHeight + 5) or 0))
    end
    table.insert(DropdownSignals, function() toggle(true) end)
    dropBtn.MouseButton1Click:Connect(function() toggle() end)
    local function UpdateOptions(newList)
        options = newList
        for _, v in pairs(listFrame:GetChildren()) do if v:IsA("TextButton") then v:Destroy() end end
        for _, opt in pairs(newList) do
            local o = Instance.new("TextButton", listFrame)
            o.Size = UDim2.new(1, 0, 0, 32); o.BackgroundColor3 = Theme.Secondary; o.Text = opt
            o.TextColor3 = Theme.Text; o.TextSize = 14; o.ZIndex = 31; o.Font = Enum.Font.Gotham; o.BorderSizePixel = 0
            o.MouseButton1Click:Connect(function() dropBtn.Text = text .. " : " .. opt; callback(opt); toggle(true) end)
        end
        listFrame.CanvasSize = UDim2.new(0,0,0,#newList*32)
        if isOpen then toggle(false); toggle() end
    end
    UpdateOptions(options)
    return {UpdateList = UpdateOptions}
end

-- [[ MONTAGEM DAS PÁGINAS ]]
local PageCombat = CreatePage("Combat")
local PageMove = CreatePage("Move")
local PageWorld = CreatePage("World")
local PageFarm = CreatePage("Farm")

AddTab("⚔️ Combate", PageCombat)
AddTab("🏃 Movimento", PageMove)
AddTab("🌍 Mundo", PageWorld)
AddTab("🚜 Farm/Itens", PageFarm)

-- [[ PÁGINA: COMBATE ]]
local SecHitP = CreateSection(PageCombat, "Hitbox Jogadores")
local HitboxPlayer, HitboxRGB, PlayerHitboxSize, transparency, fixedColor = false, false, 10, 0.5, Color3.new(0, 1, 0)
CreateTextBox(SecHitP, "Tamanho", "Ex: 10", function(v) PlayerHitboxSize = tonumber(v) or 10 end)
CreateToggle(SecHitP, "Ativar Hitbox Jogadores", false, function(s) 
    HitboxPlayer = s 
    if not s then for _, p in pairs(Players:GetPlayers()) do if p ~= LocalPlayer and p.Character and p.Character:FindFirstChild("HumanoidRootPart") then local hrp = p.Character.HumanoidRootPart hrp.Size = Vector3.new(2, 2, 1) hrp.Transparency = 1 hrp.CanCollide = true end end end
end)
CreateToggle(SecHitP, "RGB Hitbox Colorido", false, function(s) HitboxRGB = s end)

local SecHitN = CreateSection(PageCombat, "Hitbox NPCs")
local NPCHitboxDir, NPCHitboxSize, NPCHitboxLoop = "workspace.NPCs", 20, false
CreateTextBox(SecHitN, "Diretório NPCs", "workspace.NPCs", function(v) NPCHitboxDir = v end)
CreateTextBox(SecHitN, "Tamanho NPC", "Ex: 20", function(v) NPCHitboxSize = tonumber(v) or 20 end)
CreateToggle(SecHitN, "Ativar Hitbox NPCs", false, function(s) NPCHitboxLoop = s end)

-- [[ PÁGINA: MOVIMENTO ]]
local SecAtrib = CreateSection(PageMove, "Atributos Base")
CreateTextBox(SecAtrib, "Velocidade", "Ex: 50", function(val) local v = tonumber(val) if v and LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("Humanoid") then LocalPlayer.Character.Humanoid.WalkSpeed = v end end)
CreateTextBox(SecAtrib, "Pulo (Height)", "Ex: 100", function(val) local v = tonumber(val) if v and LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("Humanoid") then LocalPlayer.Character.Humanoid.JumpHeight = v end end)

local SecEspecial = CreateSection(PageMove, "Movimento Especial")
local InfJump = false
CreateToggle(SecEspecial, "Pulo Infinito", false, function(s) InfJump = s end)
local NoclipConn
CreateToggle(SecEspecial, "Noclip", false, function(state)
    if state then NoclipConn = RunService.Stepped:Connect(function() if LocalPlayer.Character then for _, v in pairs(LocalPlayer.Character:GetDescendants()) do if v:IsA("BasePart") and v.CanCollide then v.CanCollide = false end end end end)
    else if NoclipConn then NoclipConn:Disconnect() end end
end)

-- [[ PÁGINA: MUNDO ]]
local SecAmb = CreateSection(PageWorld, "Visual & Ambiente")
local OriginalLighting = {Ambient = Lighting.Ambient, Brightness = Lighting.Brightness, OutdoorAmbient = Lighting.OutdoorAmbient}
CreateToggle(SecAmb, "Fullbright", false, function(state)
    if state then Lighting.Ambient = Color3.new(1, 1, 1) Lighting.OutdoorAmbient = Color3.new(1, 1, 1) Lighting.Brightness = 2
    else Lighting.Ambient = OriginalLighting.Ambient Lighting.OutdoorAmbient = OriginalLighting.OutdoorAmbient Lighting.Brightness = OriginalLighting.Brightness end
end)

local SecESP = CreateSection(PageWorld, "ESP de Objetos")
local ESPDir, ESPActive, ESPTags = "workspace.Itens", false, {}
local function AplicarESP(obj)
    if not obj:FindFirstChild("RN_ESP_Tag") then
        local bgui = Instance.new("BillboardGui", obj); bgui.Name = "RN_ESP_Tag"; bgui.AlwaysOnTop = true; bgui.Size = UDim2.new(0, 100, 0, 30); bgui.StudsOffset = Vector3.new(0, 2, 0)
        local text = Instance.new("TextLabel", bgui); text.BackgroundTransparency = 1; text.Size = UDim2.new(1, 0, 1, 0); text.Text = obj.Name; text.TextColor3 = Color3.new(1, 1, 0); text.Font = Enum.Font.SourceSansBold; text.TextSize = 14
        local hl = Instance.new("Highlight", obj); hl.Name = "RN_ESP_HL"; hl.FillColor = Color3.new(1, 1, 0); hl.FillTransparency = 0.5
        table.insert(ESPTags, {obj, bgui, hl})
    end
end
CreateTextBox(SecESP, "Diretório ESP", "workspace.Itens", function(v) ESPDir = v end)
CreateToggle(SecESP, "Ativar ESP", false, function(s)
    ESPActive = s
    if not s then for _, data in pairs(ESPTags) do if data[2] then data[2]:Destroy() end if data[3] then data[3]:Destroy() end end ESPTags = {} end
end)

-- [[ PÁGINA: FARM ]]

-- MELHORIA: AUTO FARM NPC (RESGATANDO LÓGICA ANTIGA E FLUIDA)
local SecAF = CreateSection(PageFarm, "Auto Farm NPC")
local FarmDir, FarmTarget, FarmOffset, FarmActive = "workspace.NPCs", "", -5, false
CreateTextBox(SecAF, "Diretório NPCs", "workspace.NPCs", function(v) FarmDir = v end)
local FarmDropdown = CreateDropdown(SecAF, "Alvo", {}, function(opt) FarmTarget = opt end)
CreateButton(SecAF, "Atualizar Lista", function()
    local folder = GetPathFromString(FarmDir); local list = {}
    if folder then for _, v in pairs(folder:GetChildren()) do if v:IsA("Model") and v:FindFirstChild("HumanoidRootPart") then table.insert(list, v.Name) end end end
    FarmDropdown.UpdateList(list)
    if #list > 0 then FarmTarget = list[1] end
end)
CreateTextBox(SecAF, "Altura Offset", "-5", function(v) FarmOffset = tonumber(v) or -5 end)
CreateToggle(SecAF, "Ativar Auto Farm NPC", false, function(s) FarmActive = s end)

-- MELHORIA: TELEPORT DE ITENS (ADICIONADO LOOP E PIVOTTO DIRETO)
local SecTP = CreateSection(PageFarm, "Teleport de Itens")
local ItemDir, ItemTarget, ItemLoop = "workspace.Map", "", false
CreateTextBox(SecTP, "Diretório Itens", "workspace.Map", function(v) ItemDir = v end)
local ItemDropdown = CreateDropdown(SecTP, "Selecionar Item", {}, function(opt) ItemTarget = opt end)
CreateButton(SecTP, "Atualizar Itens", function()
    local folder = GetPathFromString(ItemDir); local list = {}
    if folder then for _, v in pairs(folder:GetChildren()) do table.insert(list, v.Name) end end
    ItemDropdown.UpdateList(list)
    if #list > 0 then ItemTarget = list[1] end
end)
CreateButton(SecTP, "Teleportar (Único)", function()
    local folder = GetPathFromString(ItemDir)
    local char = LocalPlayer.Character
    if folder and ItemTarget ~= "" and char then 
        local targetObj = folder:FindFirstChild(ItemTarget) 
        if targetObj then 
            char:PivotTo(targetObj:IsA("Model") and targetObj:GetPivot() or targetObj.CFrame)
        end 
    end
end)
CreateToggle(SecTP, "Loop Teleport Item", false, function(s) ItemLoop = s end)

-- COLETA AUTOMÁTICA OTIMIZADA
local SecCol = CreateSection(PageFarm, "Coleta Automática (Touch)")
local ColetaDir, LoopColeta = "workspace.Drops", false
CreateTextBox(SecCol, "Diretório de Itens", "Ex: workspace.Drops", function(v) ColetaDir = v end)
local function ExecutarColeta()
    local folder = GetPathFromString(ColetaDir)
    local char = LocalPlayer.Character
    if not folder or not char or not char:FindFirstChild("HumanoidRootPart") then return end
    local root = char.HumanoidRootPart
    for _, obj in ipairs(folder:GetDescendants()) do
        if obj:IsA("BasePart") then
            firetouchinterest(root, obj, 0)
            firetouchinterest(root, obj, 1)
        end
    end
end
CreateButton(SecCol, "Coletar Tudo Agora", function() task.spawn(function() pcall(ExecutarColeta) end) end)
CreateToggle(SecCol, "Loop Coletar Tudo", false, function(s) LoopColeta = s end)

-- [[ LÓGICA DE DRAG E LOOPS ]]
local function MakeDraggable(obj, dragPart)
    local dragging, dragStart, startPos
    dragPart.InputBegan:Connect(function(input) if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then dragging = true; dragStart = input.Position; startPos = obj.Position end end)
    UserInputService.InputChanged:Connect(function(input) if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then local delta = input.Position - dragStart obj.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y) end end)
    dragPart.InputEnded:Connect(function() dragging = false end)
end

MakeDraggable(MainFrame, SideTitle); MakeDraggable(FloatingBtn, FloatingBtn)
FloatingBtn.MouseButton1Click:Connect(function() CloseAllDropdowns(); MainFrame.Visible = not MainFrame.Visible end)

local hue = 0
RunService.RenderStepped:Connect(function()
    hue = (hue + 0.01) % 1
    if HitboxPlayer then
        for _, player in pairs(Players:GetPlayers()) do
            if player ~= LocalPlayer and player.Character and player.Character:FindFirstChild("HumanoidRootPart") then
                local hrp = player.Character.HumanoidRootPart; hrp.Size = Vector3.new(PlayerHitboxSize, PlayerHitboxSize, PlayerHitboxSize)
                hrp.Transparency = transparency; hrp.CanCollide = false
                hrp.Color = HitboxRGB and Color3.fromHSV(hue, 1, 1) or fixedColor
            end
        end
    end
    if NPCHitboxLoop then
        local folder = GetPathFromString(NPCHitboxDir)
        if folder then for _, npc in pairs(folder:GetChildren()) do if npc:IsA("Model") and npc:FindFirstChild("HumanoidRootPart") then local hrp = npc.HumanoidRootPart hrp.Size = Vector3.new(NPCHitboxSize, NPCHitboxSize, NPCHitboxSize) hrp.Transparency = 0.7 hrp.BrickColor = BrickColor.new("Really blue") hrp.Material = "Neon" hrp.CanCollide = false end end end
    end
end)

RunService.Heartbeat:Connect(function()
    if ESPActive then
        local folder = GetPathFromString(ESPDir)
        if folder then for _, v in pairs(folder:GetChildren()) do if v:IsA("BasePart") or v:IsA("Model") or v:IsA("MeshPart") or v:IsA("UnionOperation") then AplicarESP(v) end end end
    end
end)

-- LOOP PRINCIPAL DE FARM E TELEPORT (VELOCIDADE MÁXIMA 0.01s)
task.spawn(function()
    while true do
        -- LÓGICA DE FARM NPC (RESGATADA)
        if FarmActive and FarmTarget ~= "" then
            pcall(function()
                local char = LocalPlayer.Character
                local root = char and char:FindFirstChild("HumanoidRootPart")
                if root then
                    local targetNPC = nil
                    -- 1. Procura no diretório definido (Rápido)
                    local folder = GetPathFromString(FarmDir)
                    if folder then targetNPC = folder:FindFirstChild(FarmTarget) end
                    
                    -- 2. Se não achou, procura em todo o Workspace (Segurança do script antigo)
                    if not targetNPC then
                        for _, obj in ipairs(workspace:GetDescendants()) do
                            if obj.Name == FarmTarget and obj:FindFirstChild("HumanoidRootPart") then
                                targetNPC = obj
                                break
                            end
                        end
                    end

                    if targetNPC and targetNPC:FindFirstChild("HumanoidRootPart") then
                        local npcRoot = targetNPC.HumanoidRootPart
                        local targetPos = npcRoot.Position + Vector3.new(0, FarmOffset, 0)
                        -- Aplica CFrame direto com orientação (Resgatado do script original)
                        root.CFrame = CFrame.new(targetPos, npcRoot.Position)
                    end
                end
            end)
        end

        -- LÓGICA DE TELEPORT ITEM (LOOP)
        if ItemLoop and ItemTarget ~= "" then
            pcall(function()
                local folder = GetPathFromString(ItemDir)
                local char = LocalPlayer.Character
                if folder and char then
                    local targetObj = folder:FindFirstChild(ItemTarget)
                    if targetObj then
                        char:PivotTo(targetObj:IsA("Model") and targetObj:GetPivot() or targetObj.CFrame)
                    end
                end
            end)
        end

        -- LÓGICA DE COLETA (SE ATIVO)
        if LoopColeta then pcall(ExecutarColeta) end

        task.wait(0.01) -- Velocidade máxima resgatada
    end
end)

UserInputService.JumpRequest:Connect(function() if InfJump and LocalPlayer.Character and LocalPlayer.Character:FindFirstChildOfClass("Humanoid") then LocalPlayer.Character:FindFirstChildOfClass("Humanoid"):ChangeState("Jumping") end end)

PageCombat.Visible = true
CreateButton(PageWorld, "❌ Destruir Menu", function() ScreenGui:Destroy() end)
