local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local HttpService = game:GetService("HttpService")
local Lighting = game:GetService("Lighting")
local LocalPlayer = Players.LocalPlayer
local Camera = workspace.CurrentCamera

local SaveFileName = "RN_TEAM_SAVE.json"
local RN_Data = {
    ScriptsDB = {"", "", "", "", "", "", "", "", "", ""},
    Speed = 16,
    Jump = 50,
    AccentColor = {0, 200, 120},
    FlySpeed = 60,
    AntiVoid = false,
    FlyEnabled = false,
    BunnyHopEnabled = false,
    SpinSpeed = 5,
    AimbotSmooth = 0.80,
    AimbotFOV = 50,
    HitboxSize = 10,
    NPCHitboxSize = 20,
    ESPDir = "",
    FarmNPCDir = "",
    FarmItemDir = "",
    FarmPlayerOffset = -5,
    FarmNPCOffset = -5,
    FarmItemSpeed = 120,
    TweenChaseSpeed = 100,
}

local function SaveConfigs()
    pcall(function()
        writefile(SaveFileName, HttpService:JSONEncode(RN_Data))
    end)
end

local function LoadConfigs()
    pcall(function()
        if isfile and isfile(SaveFileName) then
            local data = HttpService:JSONDecode(readfile(SaveFileName))
            if data then
                for k, v in pairs(data) do
                    if RN_Data[k] ~= nil then RN_Data[k] = v end
                end
            end
        end
    end)
end
LoadConfigs()

local Theme = {
    Background  = Color3.fromRGB(10, 10, 14),
    Panel       = Color3.fromRGB(18, 18, 26),
    PanelHover  = Color3.fromRGB(25, 25, 36),
    Outline     = Color3.fromRGB(40, 40, 58),
    Accent      = Color3.fromRGB(RN_Data.AccentColor[1], RN_Data.AccentColor[2], RN_Data.AccentColor[3]),
    Text        = Color3.fromRGB(235, 235, 240),
    DarkText    = Color3.fromRGB(120, 120, 135),
    Button      = Color3.fromRGB(28, 28, 40),
    Red         = Color3.fromRGB(255, 70, 70),
    Green       = Color3.fromRGB(60, 220, 100),
    Yellow      = Color3.fromRGB(255, 200, 60),
    Blue        = Color3.fromRGB(60, 140, 255),
}

local Config = {
    BoxESP         = false,
    LineESP        = false,
    HealthESP      = false,
    NameESP        = false,
    DistanceESP    = false,
    Aimbot         = false,
    AimbotBone     = "Head",
    FOVSize        = RN_Data.AimbotFOV,
    Smoothness     = RN_Data.AimbotSmooth,
    TeamCheck      = true,
    VisibleCheck   = true,
    ShowFOVCircle  = false,
    HitboxPlayer   = false,
    HitboxNPC      = false,

    SpeedEnabled    = false,
    JumpEnabled     = false,
    FlyEnabled      = false,
    NoclipEnabled   = false,
    InfJump         = false,
    BunnyHop        = false,
    SpinEnabled     = false,
    AntiKnockback   = false,
    AntiVoid        = RN_Data.AntiVoid,

    FarmPlayer      = false,
    FarmNPC         = false,
    FarmItem        = false,
    FarmChase       = false,
    LoopCollect     = false,
    LoopTeleport    = false,

    XRay            = false,
    Tracers         = false,
    ObjESP          = false,
    Fullbright      = false,
    AntiPurchase    = false,

    DesiredSpeed    = RN_Data.Speed,
    DesiredJump     = RN_Data.Jump,
    FlySpeed        = RN_Data.FlySpeed,
    SpinSpeed       = RN_Data.SpinSpeed,
    PlayerHitboxSz  = RN_Data.HitboxSize,
    NPCHitboxSz     = RN_Data.NPCHitboxSize,
    FarmPlayerOff   = RN_Data.FarmPlayerOffset,
    FarmNPCOff      = RN_Data.FarmNPCOffset,
    FarmItemSpeed   = RN_Data.FarmItemSpeed,
    TweenSpeed      = RN_Data.TweenChaseSpeed,
    FarmPlayerTeam  = true,
    FarmChaseTeam   = true,

    NPCDir          = RN_Data.FarmNPCDir,
    ItemFarmDir     = RN_Data.FarmItemDir,
    CollectDir      = "workspace.Drops",
    TeleportDir     = "workspace.Map",
    ESPObjDir       = RN_Data.ESPDir,

    FarmNPCTargets  = {},
    TeleportTargets = {},
}

local Storage = {}
local Tracers = {}
local ESPTags = {}
local ToggleElements = {}
local controlModule = nil

pcall(function()
    controlModule = require(LocalPlayer.PlayerScripts:WaitForChild("PlayerModule"):WaitForChild("ControlModule"))
end)

local function GetPathFromString(pathStr)
    if not pathStr or pathStr == "" then return nil end
    local parts = string.split(pathStr, ".")
    local current = game
    for _, part in ipairs(parts) do
        if part == "workspace" or part == "Workspace" then
            current = workspace
        elseif current and current:FindFirstChild(part) then
            current = current[part]
        else
            return nil
        end
    end
    return current
end

local function GetNextTarget(dir, nameList)
    local folder = GetPathFromString(dir)
    if not folder then return nil end
    for _, obj in pairs(folder:GetChildren()) do
        if #nameList == 0 or table.find(nameList, obj.Name) then
            if obj:FindFirstChild("HumanoidRootPart") then return obj end
        end
    end
    return nil
end

local function IsEnemy(player)
    if not Config.TeamCheck then return true end
    if LocalPlayer.Team == nil or player.Team == nil then return true end
    return player.Team ~= LocalPlayer.Team
end

local function IsVisible(targetPart)
    if not LocalPlayer.Character then return false end
    local origin = Camera.CFrame.Position
    local direction = targetPart.Position - origin
    local params = RaycastParams.new()
    params.FilterDescendantsInstances = {LocalPlayer.Character}
    params.FilterType = Enum.RaycastFilterType.Exclude
    params.IgnoreWater = true
    local result = workspace:Raycast(origin, direction, params)
    if result then
        return result.Instance:IsDescendantOf(targetPart.Parent)
    end
    return true
end

local FlyBodyGyro, FlyBodyVel, FlyConn
local function StartFly()
    local char = LocalPlayer.Character
    local root = char and char:FindFirstChild("HumanoidRootPart")
    if not root then return end

    FlyBodyGyro = Instance.new("BodyGyro", root)
    FlyBodyGyro.MaxTorque = Vector3.new(9e9, 9e9, 9e9)
    FlyBodyGyro.P = 9e4

    FlyBodyVel = Instance.new("BodyVelocity", root)
    FlyBodyVel.Velocity = Vector3.zero
    FlyBodyVel.MaxForce = Vector3.new(9e9, 9e9, 9e9)

    FlyConn = RunService.Heartbeat:Connect(function()
        if not Config.FlyEnabled then
            if FlyBodyGyro then FlyBodyGyro:Destroy() end
            if FlyBodyVel then FlyBodyVel:Destroy() end
            if FlyConn then FlyConn:Disconnect() end
            return
        end
        local camCFrame = workspace.CurrentCamera.CFrame
        local dir = Vector3.zero
        
        if controlModule then
            local moveVector = controlModule:GetMoveVector()
            dir = (camCFrame.LookVector * -moveVector.Z) + (camCFrame.RightVector * moveVector.X)
        else
            if UserInputService:IsKeyDown(Enum.KeyCode.W) then dir = dir + camCFrame.LookVector end
            if UserInputService:IsKeyDown(Enum.KeyCode.S) then dir = dir - camCFrame.LookVector end
            if UserInputService:IsKeyDown(Enum.KeyCode.A) then dir = dir - camCFrame.RightVector end
            if UserInputService:IsKeyDown(Enum.KeyCode.D) then dir = dir + camCFrame.RightVector end
        end

        if UserInputService:IsKeyDown(Enum.KeyCode.Space) then dir = dir + Vector3.new(0,1,0) end
        if UserInputService:IsKeyDown(Enum.KeyCode.LeftShift) then dir = dir - Vector3.new(0,1,0) end

        if dir.Magnitude > 0 then
            FlyBodyVel.Velocity = dir.Unit * Config.FlySpeed
        else
            FlyBodyVel.Velocity = Vector3.zero
        end
        FlyBodyGyro.CFrame = camCFrame
    end)
end

local function StopFly()
    Config.FlyEnabled = false
    if FlyBodyGyro then FlyBodyGyro:Destroy() FlyBodyGyro = nil end
    if FlyBodyVel then FlyBodyVel:Destroy() FlyBodyVel = nil end
    if FlyConn then FlyConn:Disconnect() FlyConn = nil end
end

local NoclipConn
local function StartNoclip()
    NoclipConn = RunService.Stepped:Connect(function()
        if not Config.NoclipEnabled then NoclipConn:Disconnect() return end
        if LocalPlayer.Character then
            for _, v in pairs(LocalPlayer.Character:GetDescendants()) do
                if v:IsA("BasePart") then v.CanCollide = false end
            end
        end
    end)
end

local SpinConn
local function StartSpin()
    SpinConn = RunService.Heartbeat:Connect(function()
        if not Config.SpinEnabled then SpinConn:Disconnect() return end
        local char = LocalPlayer.Character
        local root = char and char:FindFirstChild("HumanoidRootPart")
        if root then
            root.CFrame = root.CFrame * CFrame.Angles(0, math.rad(Config.SpinSpeed), 0)
        end
    end)
end

local AntiKBConn
local function StartAntiKB()
    AntiKBConn = RunService.Heartbeat:Connect(function()
        if not Config.AntiKnockback then AntiKBConn:Disconnect() return end
        local char = LocalPlayer.Character
        local root = char and char:FindFirstChild("HumanoidRootPart")
        if root then root.Velocity = Vector3.new(0, root.Velocity.Y, 0) end
    end)
end

UserInputService.JumpRequest:Connect(function()
    local char = LocalPlayer.Character
    local hum = char and char:FindFirstChildOfClass("Humanoid")
    if (Config.InfJump or Config.BunnyHop) and hum then
        hum:ChangeState(Enum.HumanoidStateType.Jumping)
    end
end)

RunService.Heartbeat:Connect(function()
    local char = LocalPlayer.Character
    local hum = char and char:FindFirstChild("Humanoid")
    if hum then
        if Config.SpeedEnabled then hum.WalkSpeed = Config.DesiredSpeed end
        if Config.JumpEnabled then
            hum.UseJumpPower = true
            hum.JumpPower = Config.DesiredJump
        end
    end
    
    if Config.AntiVoid then
        local root = char and char:FindFirstChild("HumanoidRootPart")
        if root and root.Position.Y < -100 then
            root.CFrame = root.CFrame + Vector3.new(0, 150, 0)
            root.Velocity = Vector3.zero
        end
    end
end)

local function ApplyStats(character)
    local hum = character:WaitForChild("Humanoid")
    if Config.SpeedEnabled then hum.WalkSpeed = Config.DesiredSpeed end
    if Config.JumpEnabled then hum.UseJumpPower = true; hum.JumpPower = Config.DesiredJump end
end
LocalPlayer.CharacterAdded:Connect(function(char)
    ApplyStats(char)
    if Config.FlyEnabled then task.wait(1) StartFly() end
end)

local noclipEvent, antifallInst
local function moveto(targetCFrame, speed)
    local char = LocalPlayer.Character
    local root = char and char:FindFirstChild("HumanoidRootPart")
    if not root then return end
    local dist = (root.Position - targetCFrame.Position).Magnitude
    local info = TweenInfo.new(dist / speed, Enum.EasingStyle.Linear)
    local tween = TweenService:Create(root, info, {CFrame = targetCFrame})
    if not antifallInst then
        antifallInst = Instance.new("BodyVelocity", root)
        antifallInst.Velocity = Vector3.zero
        noclipEvent = RunService.Stepped:Connect(function()
            if LocalPlayer.Character then
                for _, v in pairs(LocalPlayer.Character:GetDescendants()) do
                    if v:IsA("BasePart") then v.CanCollide = false end
                end
            end
        end)
    end
    tween:Play()
    tween.Completed:Connect(function(state)
        if state == Enum.PlaybackState.Completed then
            if antifallInst then antifallInst:Destroy() antifallInst = nil end
            if noclipEvent then noclipEvent:Disconnect() noclipEvent = nil end
        end
    end)
end

RunService.RenderStepped:Connect(function()
    if Config.HitboxPlayer then
        for _, p in pairs(Players:GetPlayers()) do
            if p ~= LocalPlayer and p.Character and p.Character:FindFirstChild("HumanoidRootPart") then
                local hrp = p.Character.HumanoidRootPart
                hrp.Size = Vector3.new(Config.PlayerHitboxSz, Config.PlayerHitboxSz, Config.PlayerHitboxSz)
                hrp.Transparency = 0.5
                hrp.CanCollide = false
            end
        end
    end
    if Config.HitboxNPC then
        local folder = GetPathFromString(Config.NPCDir)
        if folder then
            for _, npc in pairs(folder:GetChildren()) do
                if npc:IsA("Model") and npc:FindFirstChild("HumanoidRootPart") then
                    local hrp = npc.HumanoidRootPart
                    hrp.Size = Vector3.new(Config.NPCHitboxSz, Config.NPCHitboxSz, Config.NPCHitboxSz)
                    hrp.Transparency = 0.5
                    hrp.CanCollide = false
                end
            end
        end
    end
end)

local FOVCircle = Drawing.new("Circle")
FOVCircle.Visible = false
FOVCircle.Radius = Config.FOVSize
FOVCircle.Color = Color3.new(1, 1, 1)
FOVCircle.Thickness = 1
FOVCircle.Filled = false
FOVCircle.Transparency = 1

local function CreateDrawings(player)
    if Storage[player] then return end
    local d = {}
    pcall(function()
        d.Box = Drawing.new("Square")
        d.Box.Thickness = 1.5
        d.Box.Filled = false
        d.Box.Color = Color3.fromRGB(255, 255, 255)
        d.Box.Visible = false

        d.Line = Drawing.new("Line")
        d.Line.Thickness = 1
        d.Line.Color = Color3.fromRGB(255, 255, 255)
        d.Line.Visible = false

        d.Health = Drawing.new("Line")
        d.Health.Thickness = 3
        d.Health.Color = Color3.fromRGB(60, 220, 80)
        d.Health.Visible = false

        d.Name = Drawing.new("Text")
        d.Name.Size = 13
        d.Name.Center = true
        d.Name.Outline = true
        d.Name.Color = Color3.fromRGB(255, 255, 255)
        d.Name.Visible = false

        d.Dist = Drawing.new("Text")
        d.Dist.Size = 11
        d.Dist.Center = true
        d.Dist.Outline = true
        d.Dist.Color = Color3.fromRGB(180, 180, 180)
        d.Dist.Visible = false
    end)
    Storage[player] = d
end

local function CreateTracer(player)
    if Tracers[player] then return end
    local t = Drawing.new("Line")
    t.Visible = false
    t.Color = Color3.fromRGB(255, 255, 100)
    t.Thickness = 1
    t.Transparency = 1
    Tracers[player] = t
end

Players.PlayerRemoving:Connect(function(p)
    if Storage[p] then for _, v in pairs(Storage[p]) do pcall(function() v:Remove() end) end Storage[p] = nil end
    if Tracers[p] then Tracers[p]:Remove() Tracers[p] = nil end
end)
for _, p in pairs(Players:GetPlayers()) do if p ~= LocalPlayer then CreateDrawings(p) CreateTracer(p) end end
Players.PlayerAdded:Connect(function(p) CreateDrawings(p) CreateTracer(p) end)

RunService.RenderStepped:Connect(function()
    Camera = workspace.CurrentCamera
    local vp = Camera.ViewportSize
    local Center = Vector2.new(vp.X / 2, vp.Y / 2)

    if Config.ShowFOVCircle then
        FOVCircle.Visible = true
        FOVCircle.Position = Center
        FOVCircle.Radius = Config.FOVSize
    else
        FOVCircle.Visible = false
    end

    local aimbotTarget = nil
    local aimbotDist = Config.FOVSize

    for _, player in pairs(Players:GetPlayers()) do
        if player == LocalPlayer then continue end
        local char = player.Character
        local ESP = Storage[player]
        local Tracer = Tracers[player]

        local isEnemy = IsEnemy(player)
        local alive = char and char:FindFirstChild("HumanoidRootPart") and char:FindFirstChild("Humanoid") and char.Humanoid.Health > 0

        if ESP and isEnemy and alive then
            local root = char.HumanoidRootPart
            local hum = char.Humanoid
            local pos, onScreen = Camera:WorldToViewportPoint(root.Position)

            if onScreen then
                local scale = 1 / (pos.Z * math.tan(math.rad(Camera.FieldOfView * 0.5)) * 2) * 1000
                local W, H = 3.5 * scale, 5 * scale
                local bx, by = pos.X - W/2, pos.Y - H/2

                if Config.BoxESP and ESP.Box then
                    ESP.Box.Visible = true; ESP.Box.Size = Vector2.new(W, H); ESP.Box.Position = Vector2.new(bx, by)
                else if ESP.Box then ESP.Box.Visible = false end end

                if Config.LineESP and ESP.Line then
                    ESP.Line.Visible = true; ESP.Line.From = Vector2.new(vp.X / 2, vp.Y); ESP.Line.To = Vector2.new(pos.X, pos.Y)
                else if ESP.Line then ESP.Line.Visible = false end end

                if Config.HealthESP and ESP.Health then
                    local pct = hum.Health / math.max(hum.MaxHealth, 1)
                    local barH = H * pct
                    ESP.Health.Visible = true
                    ESP.Health.From = Vector2.new(bx - 6, by + H)
                    ESP.Health.To = Vector2.new(bx - 6, by + H - barH)
                    ESP.Health.Color = Color3.fromRGB(math.floor(255 * (1 - pct)), math.floor(255 * pct), 0)
                else if ESP.Health then ESP.Health.Visible = false end end

                if Config.NameESP and ESP.Name then
                    ESP.Name.Visible = true; ESP.Name.Position = Vector2.new(pos.X, by - 16); ESP.Name.Text = player.Name
                else if ESP.Name then ESP.Name.Visible = false end end

                if Config.DistanceESP and ESP.Dist then
                    local myRoot = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")
                    local dist = myRoot and math.floor((root.Position - myRoot.Position).Magnitude) or 0
                    ESP.Dist.Visible = true; ESP.Dist.Position = Vector2.new(pos.X, by + H + 2); ESP.Dist.Text = dist .. "m"
                else if ESP.Dist then ESP.Dist.Visible = false end end
            else
                for _, v in pairs(ESP) do if v then v.Visible = false end end
            end
        elseif ESP then
            for _, v in pairs(ESP) do if v then v.Visible = false end end
        end

        if Tracer then
            if Config.Tracers and isEnemy and alive then
                local pos2, on2 = Camera:WorldToViewportPoint(char.HumanoidRootPart.Position)
                if on2 then
                    Tracer.Visible = true; Tracer.From = Vector2.new(vp.X / 2, vp.Y); Tracer.To = Vector2.new(pos2.X, pos2.Y)
                else Tracer.Visible = false end
            else Tracer.Visible = false end
        end

        -- RN TEAM
        if Config.XRay and alive then
            local cham = char:FindFirstChild("RN_XRay")
            if not cham then
                cham = Instance.new("Highlight")
                cham.Name = "RN_XRay"
                cham.Parent = char
                cham.FillTransparency = 0.5
                cham.OutlineTransparency = 0
                cham.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop
            end
            cham.Enabled = true
            local teamColor = isEnemy and Theme.Red or Theme.Green
            cham.FillColor = teamColor
            cham.OutlineColor = teamColor
        elseif char then
            local cham = char:FindFirstChild("RN_XRay")
            if cham then cham.Enabled = false end
        end

        if Config.Aimbot and isEnemy and alive then
            local bone = char:FindFirstChild(Config.AimbotBone) or char:FindFirstChild("Head")
            if bone then
                local bpos, bon = Camera:WorldToViewportPoint(bone.Position)
                if bon then
                    if Config.VisibleCheck and not IsVisible(bone) then continue end
                    local mag = (Vector2.new(bpos.X, bpos.Y) - Center).Magnitude
                    if mag < aimbotDist then aimbotDist = mag aimbotTarget = bone end
                end
            end
        end
    end

    if Config.Aimbot and aimbotTarget then
        Camera.CFrame = Camera.CFrame:Lerp(
            CFrame.new(Camera.CFrame.Position, aimbotTarget.Position),
            Config.Smoothness
        )
    end
end)

RunService.Heartbeat:Connect(function()
    if Config.ObjESP then
        local folder = GetPathFromString(Config.ESPObjDir)
        if folder then
            for _, v in pairs(folder:GetChildren()) do
                if (v:IsA("BasePart") or v:IsA("Model") or v:IsA("MeshPart") or v:IsA("UnionOperation")) and not v:FindFirstChild("RN_ESP_Tag") then
                    local bgui = Instance.new("BillboardGui", v)
                    bgui.Name = "RN_ESP_Tag"
                    bgui.AlwaysOnTop = true
                    bgui.Size = UDim2.new(0, 120, 0, 35)
                    bgui.StudsOffset = Vector3.new(0, 3, 0)
                    local lbl = Instance.new("TextLabel", bgui)
                    lbl.BackgroundTransparency = 1
                    lbl.Size = UDim2.new(1, 0, 1, 0)
                    lbl.Text = v.Name
                    lbl.TextColor3 = Color3.new(1, 1, 1)
                    lbl.Font = Enum.Font.GothamBold
                    lbl.TextSize = 11
                    lbl.TextStrokeTransparency = 0
                    local hl = Instance.new("Highlight", v)
                    hl.Name = "RN_ESP_HL"
                    hl.FillTransparency = 0.6
                    hl.OutlineTransparency = 0
                    table.insert(ESPTags, {v, bgui, hl})
                end
            end
        end
    end
end)

local CurrentFarmNPC, CurrentFarmItem = nil, nil

task.spawn(function()
    while true do
        task.wait()

        if Config.FarmPlayer then
            pcall(function()
                local char = LocalPlayer.Character
                local root = char and char:FindFirstChild("HumanoidRootPart")
                if not root then return end
                local closest, closestDist = nil, math.huge
                for _, p in pairs(Players:GetPlayers()) do
                    if p ~= LocalPlayer and p.Character and p.Character:FindFirstChild("HumanoidRootPart") then
                        local hum = p.Character:FindFirstChild("Humanoid")
                        if hum and hum.Health > 0 then
                            local isEnemy = not Config.FarmPlayerTeam or not LocalPlayer.Team or not p.Team or (LocalPlayer.Team ~= p.Team)
                            if isEnemy then
                                local d = (p.Character.HumanoidRootPart.Position - root.Position).Magnitude
                                if d < closestDist then closestDist = d closest = p.Character.HumanoidRootPart end
                            end
                        end
                    end
                end
                if closest then
                    root.CFrame = CFrame.new(closest.Position + Vector3.new(0, Config.FarmPlayerOff, 0), closest.Position)
                end
            end)
        end

        if Config.FarmNPC and #Config.FarmNPCTargets > 0 then
            pcall(function()
                local char = LocalPlayer.Character
                local root = char and char:FindFirstChild("HumanoidRootPart")
                if not root then return end
                if not CurrentFarmNPC or not CurrentFarmNPC.Parent or
                    (CurrentFarmNPC:FindFirstChild("Humanoid") and CurrentFarmNPC.Humanoid.Health <= 0) then
                    CurrentFarmNPC = GetNextTarget(Config.NPCDir, Config.FarmNPCTargets)
                end
                if CurrentFarmNPC and CurrentFarmNPC:FindFirstChild("HumanoidRootPart") then
                    local npcRoot = CurrentFarmNPC.HumanoidRootPart
                    root.CFrame = CFrame.new(npcRoot.Position + Vector3.new(0, Config.FarmNPCOff, 0), npcRoot.Position)
                end
            end)
        end

        if Config.FarmItem then
            pcall(function()
                local folder = GetPathFromString(Config.ItemFarmDir)
                local char = LocalPlayer.Character
                local root = char and char:FindFirstChild("HumanoidRootPart")
                if not (folder and root) then return end
                if not CurrentFarmItem or not CurrentFarmItem.Parent then
                    CurrentFarmItem = nil
                    for _, v in pairs(folder:GetChildren()) do
                        if v:IsA("BasePart") or v:IsA("Model") or v:IsA("MeshPart") then
                            CurrentFarmItem = v; break
                        end
                    end
                end
                if CurrentFarmItem then
                    local cf = CurrentFarmItem:IsA("Model") and CurrentFarmItem:GetPivot() or CurrentFarmItem.CFrame
                    moveto(cf, Config.FarmItemSpeed)
                end
            end)
        end

        if Config.FarmChase then
            pcall(function()
                local char = LocalPlayer.Character
                local root = char and char:FindFirstChild("HumanoidRootPart")
                if not root then return end
                local closest, closestDist = nil, math.huge
                for _, p in pairs(Players:GetPlayers()) do
                    if p ~= LocalPlayer and p.Character and p.Character:FindFirstChild("HumanoidRootPart") then
                        local hum = p.Character:FindFirstChild("Humanoid")
                        if hum and hum.Health > 0 then
                            local isEnemy = not Config.FarmChaseTeam or not LocalPlayer.Team or not p.Team or (LocalPlayer.Team ~= p.Team)
                            if isEnemy then
                                local d = (p.Character.HumanoidRootPart.Position - root.Position).Magnitude
                                if d < closestDist then closestDist = d closest = p.Character.HumanoidRootPart end
                            end
                        end
                    end
                end
                if closest then moveto(closest.CFrame, Config.TweenSpeed) end
            end)
        end

        if Config.LoopTeleport then
            pcall(function()
                local char = LocalPlayer.Character
                if not char then return end
                local target = GetNextTarget(Config.TeleportDir, Config.TeleportTargets)
                if target then
                    char:PivotTo(target:IsA("Model") and target:GetPivot() or target.CFrame)
                end
            end)
        end

        if Config.LoopCollect then
            pcall(function()
                local folder = GetPathFromString(Config.CollectDir)
                local char = LocalPlayer.Character
                local root = char and char:FindFirstChild("HumanoidRootPart")
                if not (folder and root) then return end
                for _, obj in ipairs(folder:GetDescendants()) do
                    if obj:IsA("BasePart") then
                        firetouchinterest(root, obj, 0)
                        firetouchinterest(root, obj, 1)
                    end
                end
            end)
        end
    end
end)

local ScreenGui = Instance.new("ScreenGui", LocalPlayer:WaitForChild("PlayerGui"))
ScreenGui.Name = "RN_HACKER_V5"
ScreenGui.ResetOnSpawn = false
ScreenGui.DisplayOrder = 999999
ScreenGui.IgnoreGuiInset = true

local MainFrame = Instance.new("Frame", ScreenGui)
MainFrame.Size = UDim2.new(0, 720, 0, 490)
MainFrame.Position = UDim2.new(0.5, -360, 0.5, -245)
MainFrame.BackgroundColor3 = Theme.Background
MainFrame.Visible = false
MainFrame.BorderSizePixel = 0
MainFrame.ClipsDescendants = true
Instance.new("UICorner", MainFrame).CornerRadius = UDim.new(0, 12)
local MainStroke = Instance.new("UIStroke", MainFrame)
MainStroke.Color = Theme.Accent
MainStroke.Thickness = 1.5

local TopBar = Instance.new("Frame", MainFrame)
TopBar.Size = UDim2.new(1, 0, 0, 48)
TopBar.BackgroundColor3 = Theme.Panel
TopBar.BorderSizePixel = 0
Instance.new("UICorner", TopBar).CornerRadius = UDim.new(0, 12)

local Title = Instance.new("TextLabel", TopBar)
Title.Size = UDim2.new(0, 220, 1, 0)
Title.Position = UDim2.new(0, 16, 0, 0)
Title.BackgroundTransparency = 1
Title.Text = "RN TEAM"
Title.Font = Enum.Font.GothamBold
Title.TextColor3 = Theme.Accent
Title.TextSize = 16
Title.TextXAlignment = Enum.TextXAlignment.Left

local SubTitle = Instance.new("TextLabel", TopBar)
SubTitle.Size = UDim2.new(1, -240, 1, 0)
SubTitle.Position = UDim2.new(0, 200, 0, 0)
SubTitle.BackgroundTransparency = 1
SubTitle.Text = "Universal • Multi-Game"
SubTitle.Font = Enum.Font.Code
SubTitle.TextColor3 = Theme.DarkText
SubTitle.TextSize = 11
SubTitle.TextXAlignment = Enum.TextXAlignment.Left

local CloseBtn = Instance.new("TextButton", TopBar)
CloseBtn.Size = UDim2.new(0, 38, 0, 38)
CloseBtn.Position = UDim2.new(1, -44, 0, 5)
CloseBtn.BackgroundColor3 = Color3.fromRGB(60, 20, 20)
CloseBtn.Text = "×"
CloseBtn.TextColor3 = Theme.Red
CloseBtn.Font = Enum.Font.GothamBold
CloseBtn.TextSize = 22
Instance.new("UICorner", CloseBtn).CornerRadius = UDim.new(0, 6)
CloseBtn.MouseButton1Click:Connect(function() ScreenGui:Destroy() end)

local MinBtn = Instance.new("TextButton", TopBar)
MinBtn.Size = UDim2.new(0, 38, 0, 38)
MinBtn.Position = UDim2.new(1, -86, 0, 5)
MinBtn.BackgroundColor3 = Color3.fromRGB(30, 50, 20)
MinBtn.Text = "—"
MinBtn.TextColor3 = Theme.Green
MinBtn.Font = Enum.Font.GothamBold
MinBtn.TextSize = 18
Instance.new("UICorner", MinBtn).CornerRadius = UDim.new(0, 6)

local minimized = false
MinBtn.MouseButton1Click:Connect(function()
    minimized = not minimized
    if minimized then
        TweenService:Create(MainFrame, TweenInfo.new(0.3), {Size = UDim2.new(0, 720, 0, 48)}):Play()
    else
        TweenService:Create(MainFrame, TweenInfo.new(0.3), {Size = UDim2.new(0, 720, 0, 490)}):Play()
    end
end)

local TabContainer = Instance.new("Frame", MainFrame)
TabContainer.Name = "TabContainer"
TabContainer.Size = UDim2.new(0, 155, 1, -58)
TabContainer.Position = UDim2.new(0, 8, 0, 54)
TabContainer.BackgroundTransparency = 1
local TabList = Instance.new("UIListLayout", TabContainer)
TabList.Padding = UDim.new(0, 5)

local PagesFolder = Instance.new("Frame", MainFrame)
PagesFolder.Name = "PagesContainer"
PagesFolder.Size = UDim2.new(1, -178, 1, -62)
PagesFolder.Position = UDim2.new(0, 168, 0, 57)
PagesFolder.BackgroundTransparency = 1

local FloatingBtn = Instance.new("Frame", ScreenGui)
FloatingBtn.Size = UDim2.new(0, 64, 0, 64)
FloatingBtn.Position = UDim2.new(0.04, 0, 0.1, 0)
FloatingBtn.BackgroundColor3 = Theme.Background
FloatingBtn.Active = true
Instance.new("UICorner", FloatingBtn).CornerRadius = UDim.new(1, 0)
local FloatStroke = Instance.new("UIStroke", FloatingBtn)
FloatStroke.Color = Theme.Accent
FloatStroke.Thickness = 2

local FloatClick = Instance.new("TextButton", FloatingBtn)
FloatClick.Size = UDim2.new(1, 0, 1, 0)
FloatClick.BackgroundTransparency = 1
FloatClick.Text = "RN"
FloatClick.TextColor3 = Theme.Accent
FloatClick.Font = Enum.Font.GothamBold
FloatClick.TextSize = 20
FloatClick.MouseButton1Click:Connect(function() MainFrame.Visible = not MainFrame.Visible end)

local function MakeDraggable(obj, handle)
    local dragging, dragStart, startPos
    handle.InputBegan:Connect(function(inp)
        if inp.UserInputType == Enum.UserInputType.MouseButton1 or inp.UserInputType == Enum.UserInputType.Touch then
            dragging = true
            dragStart = inp.Position
            startPos = obj.Position
            inp.Changed:Connect(function()
                if inp.UserInputState == Enum.UserInputState.End then dragging = false end
            end)
        end
    end)
    UserInputService.InputChanged:Connect(function(inp)
        if dragging and (inp.UserInputType == Enum.UserInputType.MouseMovement or inp.UserInputType == Enum.UserInputType.Touch) then
            local d = inp.Position - dragStart
            obj.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + d.X, startPos.Y.Scale, startPos.Y.Offset + d.Y)
        end
    end)
end
MakeDraggable(MainFrame, TopBar)
MakeDraggable(FloatingBtn, FloatClick)

local function CreatePage()
    local page = Instance.new("Frame", PagesFolder)
    page.Size = UDim2.new(1, 0, 1, 0)
    page.BackgroundTransparency = 1
    page.Visible = false
    local left = Instance.new("ScrollingFrame", page)
    left.Size = UDim2.new(0.49, 0, 1, 0)
    left.BackgroundTransparency = 1
    left.ScrollBarThickness = 0
    left.CanvasSize = UDim2.new(0, 0, 0, 0)
    left.AutomaticCanvasSize = Enum.AutomaticSize.Y
    local right = Instance.new("ScrollingFrame", page)
    right.Size = UDim2.new(0.49, 0, 1, 0)
    right.Position = UDim2.new(0.51, 0, 0, 0)
    right.BackgroundTransparency = 1
    right.ScrollBarThickness = 0
    right.CanvasSize = UDim2.new(0, 0, 0, 0)
    right.AutomaticCanvasSize = Enum.AutomaticSize.Y
    Instance.new("UIListLayout", left).Padding = UDim.new(0, 7)
    Instance.new("UIListLayout", right).Padding = UDim.new(0, 7)
    return page, left, right
end

local ActiveTab = nil
local function AddTab(icon, name, pageObj)
    local btn = Instance.new("TextButton", TabContainer)
    btn.Size = UDim2.new(1, 0, 0, 40)
    btn.BackgroundColor3 = Theme.Panel
    btn.Text = icon .. " " .. name
    btn.TextColor3 = Theme.DarkText
    btn.Font = Enum.Font.GothamBold
    btn.TextSize = 12
    Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 7)
    local stroke = Instance.new("UIStroke", btn)
    stroke.Color = Theme.Outline
    stroke.Thickness = 1

    btn.MouseButton1Click:Connect(function()
        for _, p in pairs(PagesFolder:GetChildren()) do p.Visible = false end
        for _, b in pairs(TabContainer:GetChildren()) do
            if b:IsA("TextButton") then
                b.TextColor3 = Theme.DarkText
                b.BackgroundColor3 = Theme.Panel
            end
        end
        pageObj.Visible = true
        btn.TextColor3 = Theme.Accent
        btn.BackgroundColor3 = Theme.PanelHover
        ActiveTab = btn
    end)
    return btn
end

local function CreateSection(parent, title)
    local frame = Instance.new("Frame", parent)
    frame.Size = UDim2.new(1, 0, 0, 36)
    frame.BackgroundColor3 = Theme.Background
    frame.ClipsDescendants = true
    Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 7)
    local stroke = Instance.new("UIStroke", frame)
    stroke.Color = Theme.Outline

    local header = Instance.new("TextButton", frame)
    header.Size = UDim2.new(1, 0, 0, 36)
    header.BackgroundColor3 = Theme.Panel
    header.Text = "  ▸ " .. title
    header.TextColor3 = Theme.Text
    header.Font = Enum.Font.GothamBold
    header.TextSize = 12
    header.TextXAlignment = Enum.TextXAlignment.Left
    Instance.new("UICorner", header).CornerRadius = UDim.new(0, 7)

    local container = Instance.new("Frame", frame)
    container.Position = UDim2.new(0, 5, 0, 41)
    container.Size = UDim2.new(1, -10, 1, -41)
    container.BackgroundTransparency = 1
    local layout = Instance.new("UIListLayout", container)
    layout.Padding = UDim.new(0, 6)

    local open = false
    local function Refresh()
        local h = 36
        for _, c in pairs(container:GetChildren()) do
            if c:IsA("GuiObject") then h = h + c.Size.Y.Offset + layout.Padding.Offset end
        end
        return h
    end

    header.MouseButton1Click:Connect(function()
        open = not open
        header.Text = (open and "  ▾ " or "  ▸ ") .. title
        TweenService:Create(frame, TweenInfo.new(0.25), {Size = UDim2.new(1, 0, 0, open and Refresh() or 36)}):Play()
    end)

    container.ChildAdded:Connect(function()
        if open then
            task.wait()
            TweenService:Create(frame, TweenInfo.new(0.2), {Size = UDim2.new(1, 0, 0, Refresh())}):Play()
        end
    end)

    return container, frame, Refresh
end

local function CreateButton(parent, text, callback, color)
    local btn = Instance.new("TextButton", parent)
    btn.Size = UDim2.new(1, 0, 0, 34)
    btn.BackgroundColor3 = color or Theme.Button
    btn.Text = text
    btn.TextColor3 = Theme.Text
    btn.Font = Enum.Font.GothamBold
    btn.TextSize = 12
    Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 6)
    Instance.new("UIStroke", btn).Color = Theme.Outline
    btn.MouseButton1Click:Connect(callback)
    return btn
end

local function CreateToggle(parent, text, default, callback)
    local btn = Instance.new("TextButton", parent)
    btn.Size = UDim2.new(1, 0, 0, 36)
    btn.BackgroundColor3 = Theme.Panel
    btn.Text = "  " .. text
    btn.TextColor3 = Theme.Text
    btn.TextXAlignment = Enum.TextXAlignment.Left
    btn.Font = Enum.Font.GothamBold
    btn.TextSize = 12
    Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 6)

    local bg = Instance.new("Frame", btn)
    bg.Size = UDim2.new(0, 36, 0, 20)
    bg.Position = UDim2.new(1, -42, 0.5, -10)
    bg.BackgroundColor3 = default and Theme.Accent or Color3.fromRGB(40, 40, 55)
    Instance.new("UICorner", bg).CornerRadius = UDim.new(1, 0)

    local ball = Instance.new("Frame", bg)
    ball.Size = UDim2.new(0, 16, 0, 16)
    ball.Position = default and UDim2.new(1, -18, 0.5, -8) or UDim2.new(0, 2, 0.5, -8)
    ball.BackgroundColor3 = Color3.new(1, 1, 1)
    Instance.new("UICorner", ball).CornerRadius = UDim.new(1, 0)

    local state = default or false
    table.insert(ToggleElements, {bg = bg, ball = ball, getState = function() return state end})

    btn.MouseButton1Click:Connect(function()
        state = not state
        TweenService:Create(ball, TweenInfo.new(0.18), {Position = state and UDim2.new(1, -18, 0.5, -8) or UDim2.new(0, 2, 0.5, -8)}):Play()
        TweenService:Create(bg, TweenInfo.new(0.18), {BackgroundColor3 = state and Theme.Accent or Color3.fromRGB(40, 40, 55)}):Play()
        callback(state)
    end)
    return btn, function() return state end
end

local function CreateTextBox(parent, label, placeholder, default, callback)
    local frame = Instance.new("Frame", parent)
    frame.Size = UDim2.new(1, 0, 0, 36)
    frame.BackgroundColor3 = Theme.Panel
    Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 6)

    local lbl = Instance.new("TextLabel", frame)
    lbl.Size = UDim2.new(0.52, 0, 1, 0)
    lbl.Position = UDim2.new(0, 10, 0, 0)
    lbl.BackgroundTransparency = 1
    lbl.Text = label
    lbl.TextColor3 = Theme.Text
    lbl.Font = Enum.Font.GothamBold
    lbl.TextSize = 11
    lbl.TextXAlignment = Enum.TextXAlignment.Left

    local box = Instance.new("TextBox", frame)
    box.Size = UDim2.new(0.46, -10, 0, 26)
    box.Position = UDim2.new(0.52, 4, 0.5, -13)
    box.BackgroundColor3 = Theme.Background
    box.TextColor3 = Theme.Text
    box.PlaceholderText = placeholder or ""
    box.Text = tostring(default or "")
    box.Font = Enum.Font.Code
    box.TextSize = 11
    box.ClearTextOnFocus = false
    Instance.new("UICorner", box).CornerRadius = UDim.new(0, 5)
    Instance.new("UIStroke", box).Color = Theme.Outline

    box.FocusLost:Connect(function() callback(box.Text) end)
    return frame
end

local function CreateDropdown(parent, label, list, callback)
    local dropFrame = Instance.new("Frame", parent)
    dropFrame.Size = UDim2.new(1, 0, 0, 36)
    dropFrame.BackgroundColor3 = Theme.Panel
    dropFrame.ClipsDescendants = true
    Instance.new("UICorner", dropFrame).CornerRadius = UDim.new(0, 6)

    local header = Instance.new("TextButton", dropFrame)
    header.Size = UDim2.new(1, 0, 0, 36)
    header.BackgroundTransparency = 1
    header.Text = "  ▸ " .. label
    header.TextColor3 = Theme.Text
    header.TextXAlignment = Enum.TextXAlignment.Left
    header.Font = Enum.Font.GothamBold
    header.TextSize = 11

    local cont = Instance.new("Frame", dropFrame)
    cont.Position = UDim2.new(0, 0, 0, 36)
    cont.Size = UDim2.new(1, 0, 0, 0)
    cont.BackgroundTransparency = 1
    Instance.new("UIListLayout", cont).Padding = UDim.new(0, 2)

    local open = false

    local function Rebuild(newList)
        for _, c in pairs(cont:GetChildren()) do if c:IsA("TextButton") then c:Destroy() end end
        local totalH = #newList * 30
        cont.Size = UDim2.new(1, 0, 0, totalH)
        for _, item in ipairs(newList) do
            local itm = Instance.new("TextButton", cont)
            itm.Size = UDim2.new(1, 0, 0, 28)
            itm.BackgroundColor3 = Theme.Background
            itm.Text = "  " .. item
            itm.TextColor3 = Theme.DarkText
            itm.Font = Enum.Font.Code
            itm.TextSize = 11
            itm.TextXAlignment = Enum.TextXAlignment.Left
            Instance.new("UICorner", itm).CornerRadius = UDim.new(0, 4)
            itm.MouseButton1Click:Connect(function()
                header.Text = "  ✓ " .. label .. ": " .. item
                callback(item)
                open = false
                TweenService:Create(dropFrame, TweenInfo.new(0.2), {Size = UDim2.new(1, 0, 0, 36)}):Play()
            end)
        end
    end

    header.MouseButton1Click:Connect(function()
        open = not open
        header.Text = (open and "  ▾ " or "  ▸ ") .. label
        local targetH = open and (36 + cont.Size.Y.Offset) or 36
        TweenService:Create(dropFrame, TweenInfo.new(0.25), {Size = UDim2.new(1, 0, 0, targetH)}):Play()
    end)

    Rebuild(list)
    return {UpdateList = Rebuild, frame = dropFrame}
end

local function CreateSlider(parent, label, min, max, default, callback)
    local frame = Instance.new("Frame", parent)
    frame.Size = UDim2.new(1, 0, 0, 50)
    frame.BackgroundColor3 = Theme.Panel
    Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 6)

    local lbl = Instance.new("TextLabel", frame)
    lbl.Size = UDim2.new(1, -10, 0, 22)
    lbl.Position = UDim2.new(0, 10, 0, 0)
    lbl.BackgroundTransparency = 1
    lbl.Text = label .. ": " .. tostring(default)
    lbl.TextColor3 = Theme.Text
    lbl.Font = Enum.Font.GothamBold
    lbl.TextSize = 11
    lbl.TextXAlignment = Enum.TextXAlignment.Left

    local track = Instance.new("Frame", frame)
    track.Size = UDim2.new(1, -16, 0, 6)
    track.Position = UDim2.new(0, 8, 0, 30)
    track.BackgroundColor3 = Color3.fromRGB(35, 35, 50)
    Instance.new("UICorner", track).CornerRadius = UDim.new(1, 0)

    local fill = Instance.new("Frame", track)
    fill.BackgroundColor3 = Theme.Accent
    fill.Size = UDim2.new((default - min) / (max - min), 0, 1, 0)
    Instance.new("UICorner", fill).CornerRadius = UDim.new(1, 0)

    local knob = Instance.new("Frame", track)
    knob.Size = UDim2.new(0, 14, 0, 14)
    knob.Position = UDim2.new((default - min) / (max - min), -7, 0.5, -7)
    knob.BackgroundColor3 = Color3.new(1, 1, 1)
    Instance.new("UICorner", knob).CornerRadius = UDim.new(1, 0)

    local dragging = false
    knob.InputBegan:Connect(function(inp)
        if inp.UserInputType == Enum.UserInputType.MouseButton1 or inp.UserInputType == Enum.UserInputType.Touch then 
            dragging = true 
        end
    end)
    UserInputService.InputEnded:Connect(function(inp)
        if inp.UserInputType == Enum.UserInputType.MouseButton1 or inp.UserInputType == Enum.UserInputType.Touch then 
            dragging = false 
        end
    end)
    UserInputService.InputChanged:Connect(function(inp)
        if dragging and (inp.UserInputType == Enum.UserInputType.MouseMovement or inp.UserInputType == Enum.UserInputType.Touch) then
            local trackPos = track.AbsolutePosition.X
            local trackW = track.AbsoluteSize.X
            local pct = math.clamp((inp.Position.X - trackPos) / trackW, 0, 1)
            local val = math.floor(min + (max - min) * pct)
            fill.Size = UDim2.new(pct, 0, 1, 0)
            knob.Position = UDim2.new(pct, -7, 0.5, -7)
            lbl.Text = label .. ": " .. val
            callback(val)
        end
    end)
    return frame
end

local function CreateLabel(parent, text, color)
    local lbl = Instance.new("TextLabel", parent)
    lbl.Size = UDim2.new(1, 0, 0, 22)
    lbl.BackgroundTransparency = 1
    lbl.Text = text
    lbl.TextColor3 = color or Theme.DarkText
    lbl.Font = Enum.Font.Code
    lbl.TextSize = 11
    lbl.TextXAlignment = Enum.TextXAlignment.Left
    return lbl
end

local PageCombat, C_L, C_R = CreatePage()
local PageFarm, F_L, F_R = CreatePage()
local PageVisual, V_L, V_R = CreatePage()
local PageMove, M_L, M_R = CreatePage()
local PageMisc, X_L, X_R = CreatePage()
local PageExecutor = Instance.new("Frame", PagesFolder)
PageExecutor.Size = UDim2.new(1, 0, 1, 0)
PageExecutor.BackgroundTransparency = 1
PageExecutor.Visible = false
local PageConfig, Cfg_L, Cfg_R = CreatePage()

local tabCombat  = AddTab("⚔️", "Combate",   PageCombat)
local tabFarm    = AddTab("🌾", "Farm",       PageFarm)
local tabVisual  = AddTab("👁️", "Visual",     PageVisual)
local tabMove    = AddTab("🏃", "Movimento",  PageMove)
local tabMisc    = AddTab("🎲", "Misc",       PageMisc)
local tabExec    = AddTab("💻", "Executor",   PageExecutor)
local tabConfig  = AddTab("⚙️", "Config",     PageConfig)

PageConfig.Visible = true
tabConfig.TextColor3 = Theme.Accent
tabConfig.BackgroundColor3 = Theme.PanelHover

local SecAim, _, _ = CreateSection(C_L, "🎯 Aimbot")
CreateToggle(SecAim, "Ativar Aimbot", false, function(s) Config.Aimbot = s end)
CreateToggle(SecAim, "Mostrar Círculo FOV", false, function(s) Config.ShowFOVCircle = s end)
CreateToggle(SecAim, "Team Check", true, function(s) Config.TeamCheck = s end)
CreateToggle(SecAim, "Visible Check (Paredes)", true, function(s) Config.VisibleCheck = s end)
CreateSlider(SecAim, "FOV Tamanho", 10, 400, Config.FOVSize, function(v) Config.FOVSize = v end)
CreateSlider(SecAim, "Suavidade", 0, 100, math.floor(Config.Smoothness * 100), function(v) 
    Config.Smoothness = v / 100 
end)
CreateDropdown(SecAim, "Osso Alvo", {"Head", "HumanoidRootPart", "Torso", "UpperTorso"}, function(v) Config.AimbotBone = v end)

local SecESPP, _ = CreateSection(C_R, "📦 ESP Jogadores")
CreateToggle(SecESPP, "ESP Box", false, function(s) Config.BoxESP = s end)
CreateToggle(SecESPP, "ESP Linha (Traçador)", false, function(s) Config.LineESP = s end)
CreateToggle(SecESPP, "ESP Vida", false, function(s) Config.HealthESP = s end)
CreateToggle(SecESPP, "ESP Nome", false, function(s) Config.NameESP = s end)
CreateToggle(SecESPP, "ESP Distância", false, function(s) Config.DistanceESP = s end)
CreateToggle(SecESPP, "XRay Colorido", false, function(s) Config.XRay = s end)

local SecHitP, _ = CreateSection(C_L, "💥 Hitbox Jogadores")
CreateSlider(SecHitP, "Tamanho Hitbox", 2, 60, Config.PlayerHitboxSz, function(v) Config.PlayerHitboxSz = v; RN_Data.HitboxSize = v; SaveConfigs() end)
CreateToggle(SecHitP, "Ativar Hitbox Jogadores", false, function(s)
    Config.HitboxPlayer = s
    if not s then
        for _, p in pairs(Players:GetPlayers()) do
            if p ~= LocalPlayer and p.Character and p.Character:FindFirstChild("HumanoidRootPart") then
                local hrp = p.Character.HumanoidRootPart
                hrp.Size = Vector3.new(2, 2, 1)
                hrp.Transparency = 1
                hrp.CanCollide = true
            end
        end
    end
end)

local SecHitN, _ = CreateSection(C_R, "🤖 Hitbox NPCs")
CreateTextBox(SecHitN, "Diretório NPCs", "workspace.NPCs", Config.NPCDir, function(v) Config.NPCDir = v; RN_Data.FarmNPCDir = v; SaveConfigs() end)
CreateSlider(SecHitN, "Tamanho Hitbox NPC", 2, 100, Config.NPCHitboxSz, function(v) Config.NPCHitboxSz = v; RN_Data.NPCHitboxSize = v; SaveConfigs() end)
CreateToggle(SecHitN, "Ativar Hitbox NPCs", false, function(s) Config.HitboxNPC = s end)

local SecFarmP, _ = CreateSection(F_L, "👤 Farm Jogadores")
CreateLabel(SecFarmP, "Teleporta até o jogador inimigo")
CreateSlider(SecFarmP, "Offset Altura", -20, 10, Config.FarmPlayerOff, function(v) Config.FarmPlayerOff = v; RN_Data.FarmPlayerOffset = v; SaveConfigs() end)
CreateToggle(SecFarmP, "Ignorar Aliados", true, function(s) Config.FarmPlayerTeam = s end)
CreateToggle(SecFarmP, "Ativar Farm Jogadores", false, function(s) Config.FarmPlayer = s end)

local SecFarmN, _ = CreateSection(F_L, "🧟 Farm NPCs")
CreateTextBox(SecFarmN, "Diretório NPCs", "workspace.NPCs", Config.NPCDir, function(v) Config.NPCDir = v end)
local NpcDropdown = CreateDropdown(SecFarmN, "Alvo NPC", {}, function(v) Config.FarmNPCTargets = {v} end)
CreateButton(SecFarmN, "🔄 Atualizar Lista NPCs", function()
    local folder = GetPathFromString(Config.NPCDir)
    local list = {}
    if folder then
        for _, v in pairs(folder:GetChildren()) do
            if v:IsA("Model") and v:FindFirstChild("HumanoidRootPart") then table.insert(list, v.Name) end
        end
    end
    NpcDropdown.UpdateList(list)
end)
CreateSlider(SecFarmN, "Offset Altura NPC", -20, 10, Config.FarmNPCOff, function(v) Config.FarmNPCOff = v; RN_Data.FarmNPCOffset = v; SaveConfigs() end)
CreateToggle(SecFarmN, "Ativar Farm NPC", false, function(s) Config.FarmNPC = s; if not s then CurrentFarmNPC = nil end end)

local SecFarmI, _ = CreateSection(F_R, "💎 Farm Itens (Tween)")
CreateLabel(SecFarmI, "Vai andando até cada item")
CreateTextBox(SecFarmI, "Diretório Itens", "workspace.Drops", Config.ItemFarmDir, function(v) Config.ItemFarmDir = v; RN_Data.FarmItemDir = v; SaveConfigs() end)
CreateSlider(SecFarmI, "Velocidade Tween", 10, 500, Config.FarmItemSpeed, function(v) Config.FarmItemSpeed = v; RN_Data.FarmItemSpeed = v; SaveConfigs() end)
CreateToggle(SecFarmI, "Ativar Farm Itens", false, function(s) Config.FarmItem = s; if not s then CurrentFarmItem = nil end end)

local SecChase, _ = CreateSection(F_R, "🏹 Perseguição Tween")
CreateLabel(SecChase, "Vai em direção ao inimigo mais próximo")
CreateSlider(SecChase, "Velocidade Tween", 10, 500, Config.TweenSpeed, function(v) Config.TweenSpeed = v; RN_Data.TweenChaseSpeed = v; SaveConfigs() end)
CreateToggle(SecChase, "Ignorar Aliados", true, function(s) Config.FarmChaseTeam = s end)
CreateToggle(SecChase, "Ativar Perseguição", false, function(s) Config.FarmChase = s end)

local SecTp, _ = CreateSection(F_L, "🌀 Teleport & Coleta")
CreateTextBox(SecTp, "Diretório Teleport", "workspace.Map", Config.TeleportDir, function(v) Config.TeleportDir = v end)
local TpDropdown = CreateDropdown(SecTp, "Selecionar Item", {}, function(v) Config.TeleportTargets = {v} end)
CreateButton(SecTp, "🔄 Atualizar Itens", function()
    local folder = GetPathFromString(Config.TeleportDir)
    local list = {}
    if folder then for _, v in pairs(folder:GetChildren()) do table.insert(list, v.Name) end end
    TpDropdown.UpdateList(list)
end)
CreateToggle(SecTp, "Loop Teleport", false, function(s) Config.LoopTeleport = s end)

local SecCollect, _ = CreateSection(F_R, "🧲 Coletar Área")
CreateTextBox(SecCollect, "Diretório Coleta", "workspace.Drops", Config.CollectDir, function(v) Config.CollectDir = v end)
CreateButton(SecCollect, "⚡ Coletar Agora", function()
    local folder = GetPathFromString(Config.CollectDir)
    local char = LocalPlayer.Character
    local root = char and char:FindFirstChild("HumanoidRootPart")
    if not (folder and root) then return end
    for _, obj in ipairs(folder:GetDescendants()) do
        if obj:IsA("BasePart") then
            pcall(function() firetouchinterest(root, obj, 0) firetouchinterest(root, obj, 1) end)
        end
    end
end)
CreateToggle(SecCollect, "Loop Coletar Área", false, function(s) Config.LoopCollect = s end)

local SecFullbright, _ = CreateSection(V_L, "💡 Ambiente")
local OrigLight = {Ambient = Lighting.Ambient, Brightness = Lighting.Brightness, OutdoorAmbient = Lighting.OutdoorAmbient}
CreateToggle(SecFullbright, "Fullbright (Iluminação Max)", false, function(s)
    Config.Fullbright = s
    if s then
        Lighting.Ambient = Color3.new(1, 1, 1); Lighting.OutdoorAmbient = Color3.new(1, 1, 1); Lighting.Brightness = 2
    else
        Lighting.Ambient = OrigLight.Ambient; Lighting.OutdoorAmbient = OrigLight.OutdoorAmbient; Lighting.Brightness = OrigLight.Brightness
    end
end)
CreateButton(SecFullbright, "🌙 Noite", function() Lighting.ClockTime = 0 end)
CreateButton(SecFullbright, "☀️ Dia", function() Lighting.ClockTime = 14 end)
CreateButton(SecFullbright, "🌅 Entardecer", function() Lighting.ClockTime = 19 end)

local SecObjESP, _ = CreateSection(V_L, "🔍 ESP Objetos/Itens")
CreateTextBox(SecObjESP, "Diretório ESP", "workspace.Items", Config.ESPObjDir, function(v) Config.ESPObjDir = v; RN_Data.ESPDir = v; SaveConfigs() end)
CreateToggle(SecObjESP, "ESP Objetos Ativo", false, function(s)
    Config.ObjESP = s
    if not s then
        for _, data in pairs(ESPTags) do
            pcall(function() if data[2] then data[2]:Destroy() end if data[3] then data[3]:Destroy() end end)
        end
        ESPTags = {}
    end
end)

local SecAntiUI, _ = CreateSection(V_R, "🚫 Anti Interface")
local AntiPurchaseConn2 = nil
CreateToggle(SecAntiUI, "Fechar Telas de Compra", false, function(state)
    local pGui = LocalPlayer:WaitForChild("PlayerGui")
    local function check(gui)
        if not state or gui.Name == "RN_HACKER_V5" then return end
        pcall(function()
            if gui:IsA("ScreenGui") then
                for _, v in pairs(gui:GetDescendants()) do
                    if (v:IsA("Frame") or v:IsA("ImageLabel")) and v.Visible then
                        local s2, sc = v.AbsoluteSize, Camera.ViewportSize
                        if s2.X > sc.X * 0.7 and s2.Y > sc.Y * 0.7 then v.Visible = false end
                    end
                end
            end
        end)
    end
    if state then
        for _, g in pairs(pGui:GetChildren()) do check(g) end
        AntiPurchaseConn2 = pGui.DescendantAdded:Connect(function(obj)
            task.wait(0.5)
            if obj:IsA("ScreenGui") then check(obj)
            elseif obj.Parent and obj.Parent:IsA("ScreenGui") then check(obj.Parent) end
        end)
    else
        if AntiPurchaseConn2 then AntiPurchaseConn2:Disconnect() AntiPurchaseConn2 = nil end
    end
end)

local SecSpeed, _ = CreateSection(M_L, "💨 Velocidade e Pulo")
CreateSlider(SecSpeed, "Velocidade", 16, 500, Config.DesiredSpeed, function(v)
    Config.DesiredSpeed = v; RN_Data.Speed = v; SaveConfigs()
    local hum = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("Humanoid")
    if hum and Config.SpeedEnabled then hum.WalkSpeed = v end
end)
CreateToggle(SecSpeed, "Ativar Speed Hack", false, function(s)
    Config.SpeedEnabled = s
    if not s then
        local hum = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("Humanoid")
        if hum then hum.WalkSpeed = 16 end
    end
end)
CreateSlider(SecSpeed, "Força de Pulo", 50, 500, Config.DesiredJump, function(v) Config.DesiredJump = v; RN_Data.Jump = v; SaveConfigs() end)
CreateToggle(SecSpeed, "Ativar Super Pulo", false, function(s)
    Config.JumpEnabled = s
    if not s then
        local hum = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("Humanoid")
        if hum then hum.UseJumpPower = true; hum.JumpPower = 50 end
    end
end)
CreateToggle(SecSpeed, "Pulo Infinito (InfJump)", false, function(s) Config.InfJump = s end)
CreateToggle(SecSpeed, "Bunny Hop (Auto Pulo)", false, function(s) Config.BunnyHop = s end)

local SecFly, _ = CreateSection(M_L, "🦅 Voo e Gravidade")
CreateSlider(SecFly, "Velocidade de Voo", 10, 1000, Config.FlySpeed, function(v) Config.FlySpeed = v; RN_Data.FlySpeed = v; SaveConfigs() end)
CreateToggle(SecFly, "Ativar Fly (Joystick)", false, function(s)
    Config.FlyEnabled = s
    if s then StartFly() else StopFly() end
end)
CreateSlider(SecFly, "Gravidade do Mapa", 0, 196, 196, function(v) workspace.Gravity = v end)

local SecNoclip, _ = CreateSection(M_R, "👻 Poderes Especiais")
CreateToggle(SecNoclip, "Noclip (Atravessar Paredes)", false, function(s) Config.NoclipEnabled = s; if s then StartNoclip() end end)
CreateToggle(SecNoclip, "Anti-Knockback", false, function(s) Config.AntiKnockback = s; if s then StartAntiKB() end end)
CreateSlider(SecNoclip, "Velocidade de Spin", 1, 50, Config.SpinSpeed, function(v) Config.SpinSpeed = v; RN_Data.SpinSpeed = v; SaveConfigs() end)
CreateToggle(SecNoclip, "Spin (Girar)", false, function(s) Config.SpinEnabled = s; if s then StartSpin() end end)
CreateToggle(SecNoclip, "Anti-Void (Salva de Quedas)", Config.AntiVoid, function(s) Config.AntiVoid = s; RN_Data.AntiVoid = s; SaveConfigs() end)

local SecTeleportP, _ = CreateSection(M_R, "⚡ Teleportes Rápidos")
CreateButton(SecTeleportP, "🔵 Ir para Spawn", function() pcall(function() LocalPlayer:LoadCharacter() end) end)
CreateButton(SecTeleportP, "🔄 Reentrar no Servidor", function() game:GetService("TeleportService"):TeleportToPlaceInstance(game.PlaceId, game.JobId, LocalPlayer) end)
CreateButton(SecTeleportP, "📍 Salvar Posição Atual", function()
    local char = LocalPlayer.Character
    local root = char and char:FindFirstChild("HumanoidRootPart")
    if root then
        local saved = root.CFrame
        local btn2 = CreateButton(SecTeleportP, "↩️ Voltar para Posição Salva", function()
            local r2 = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")
            if r2 then r2.CFrame = saved end
        end)
    end
end)

local SecPlayer, _ = CreateSection(X_L, "😎 Info do Player")
CreateButton(SecPlayer, "📋 Copiar UserID", function() pcall(function() setclipboard(tostring(LocalPlayer.UserId)) end) end)
CreateButton(SecPlayer, "📋 Copiar Nome", function() pcall(function() setclipboard(LocalPlayer.Name) end) end)
CreateButton(SecPlayer, "📋 Copiar PlaceID", function() pcall(function() setclipboard(tostring(game.PlaceId)) end) end)
CreateButton(SecPlayer, "📋 Copiar JobID", function() pcall(function() setclipboard(game.JobId) end) end)

local SecRejoin, _ = CreateSection(X_R, "🔧 Sistema")
CreateButton(SecRejoin, "🗑️ Destruir GUI (Panic)", function() ScreenGui:Destroy() end, Color3.fromRGB(60, 20, 20))
CreateButton(SecRejoin, "🔄 Recarregar Character", function() pcall(function() LocalPlayer:LoadCharacter() end) end)

local SecFireTouch, _ = CreateSection(X_R, "🔥 FireTouchInterest")
CreateButton(SecFireTouch, "⚡ Ativar FireTouch em tudo", function()
    local root = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")
    if not root then return end
    for _, obj in ipairs(workspace:GetDescendants()) do
        if obj:IsA("BasePart") then
            pcall(function() firetouchinterest(root, obj, 0) firetouchinterest(root, obj, 1) end)
        end
    end
end)

local CurrentSlot = 1

local ExecNav = Instance.new("Frame", PageExecutor)
ExecNav.Size = UDim2.new(1, 0, 0, 38)
ExecNav.BackgroundTransparency = 1

local BtnPrev = Instance.new("TextButton", ExecNav)
BtnPrev.Size = UDim2.new(0, 80, 0, 34)
BtnPrev.BackgroundColor3 = Theme.Button
BtnPrev.Text = "◀ Anterior"
BtnPrev.TextColor3 = Theme.Text
BtnPrev.Font = Enum.Font.GothamBold
BtnPrev.TextSize = 11
Instance.new("UICorner", BtnPrev).CornerRadius = UDim.new(0, 6)

local LblSlot = Instance.new("TextLabel", ExecNav)
LblSlot.Size = UDim2.new(1, -180, 1, 0)
LblSlot.Position = UDim2.new(0, 90, 0, 0)
LblSlot.BackgroundTransparency = 1
LblSlot.Text = "── Slot 1 / 10 ──"
LblSlot.TextColor3 = Theme.Accent
LblSlot.Font = Enum.Font.GothamBold
LblSlot.TextSize = 12

local BtnNext = Instance.new("TextButton", ExecNav)
BtnNext.Size = UDim2.new(0, 80, 0, 34)
BtnNext.Position = UDim2.new(1, -85, 0, 0)
BtnNext.BackgroundColor3 = Theme.Button
BtnNext.Text = "Próximo ▶"
BtnNext.TextColor3 = Theme.Text
BtnNext.Font = Enum.Font.GothamBold
BtnNext.TextSize = 11
Instance.new("UICorner", BtnNext).CornerRadius = UDim.new(0, 6)

local scrollEditor = Instance.new("ScrollingFrame", PageExecutor)
scrollEditor.Size = UDim2.new(1, -8, 1, -100)
scrollEditor.Position = UDim2.new(0, 4, 0, 46)
scrollEditor.BackgroundTransparency = 1
scrollEditor.CanvasSize = UDim2.new(0, 0, 0, 0)
scrollEditor.AutomaticCanvasSize = Enum.AutomaticSize.Y
scrollEditor.ScrollBarThickness = 0

local scriptBox = Instance.new("TextBox", scrollEditor)
scriptBox.Size = UDim2.new(1, -4, 1, 0)
scriptBox.BackgroundColor3 = Theme.Panel
scriptBox.Text = RN_Data.ScriptsDB[CurrentSlot]
scriptBox.PlaceholderText = "-- Cole seu script aqui...\n-- Slot " .. CurrentSlot .. " / 10"
scriptBox.TextColor3 = Theme.Text
scriptBox.Font = Enum.Font.Code
scriptBox.TextSize = 11
scriptBox.TextXAlignment = Enum.TextXAlignment.Left
scriptBox.TextYAlignment = Enum.TextYAlignment.Top
scriptBox.ClearTextOnFocus = false
scriptBox.MultiLine = true
scriptBox.ClipsDescendants = true
Instance.new("UICorner", scriptBox).CornerRadius = UDim.new(0, 7)
Instance.new("UIStroke", scriptBox).Color = Theme.Outline

local BtnBar = Instance.new("Frame", PageExecutor)
BtnBar.Size = UDim2.new(1, -8, 0, 42)
BtnBar.Position = UDim2.new(0, 4, 1, -46)
BtnBar.BackgroundTransparency = 1

local BtnSave = Instance.new("TextButton", BtnBar)
BtnSave.Size = UDim2.new(0.48, 0, 1, 0)
BtnSave.Position = UDim2.new(0, 0, 0, 0)
BtnSave.BackgroundColor3 = Color3.fromRGB(20, 40, 20)
BtnSave.Text = "💾 Salvar Slot"
BtnSave.TextColor3 = Theme.Green
BtnSave.Font = Enum.Font.GothamBold
BtnSave.TextSize = 12
Instance.new("UICorner", BtnSave).CornerRadius = UDim.new(0, 6)

local BtnExec = Instance.new("TextButton", BtnBar)
BtnExec.Size = UDim2.new(0.48, 0, 1, 0)
BtnExec.Position = UDim2.new(0.52, 0, 0, 0)
BtnExec.BackgroundColor3 = Color3.fromRGB(20, 40, 60)
BtnExec.Text = "▶ Executar"
BtnExec.TextColor3 = Theme.Blue
BtnExec.Font = Enum.Font.GothamBold
BtnExec.TextSize = 12
Instance.new("UICorner", BtnExec).CornerRadius = UDim.new(0, 6)

local function UpdateExecUI()
    LblSlot.Text = "── Slot " .. CurrentSlot .. " / 10 ──"
    scriptBox.Text = RN_Data.ScriptsDB[CurrentSlot]
    scriptBox.PlaceholderText = "-- Slot " .. CurrentSlot .. " / 10"
end

BtnPrev.MouseButton1Click:Connect(function() CurrentSlot = CurrentSlot > 1 and CurrentSlot - 1 or 10; UpdateExecUI() end)
BtnNext.MouseButton1Click:Connect(function() CurrentSlot = CurrentSlot < 10 and CurrentSlot + 1 or 1; UpdateExecUI() end)
BtnSave.MouseButton1Click:Connect(function() RN_Data.ScriptsDB[CurrentSlot] = scriptBox.Text; SaveConfigs() end)
BtnExec.MouseButton1Click:Connect(function()
    local code = scriptBox.Text
    if code ~= "" then
        pcall(function() local fn = loadstring(code); if fn then fn() end end)
    end
end)
scriptBox:GetPropertyChangedSignal("Text"):Connect(function() RN_Data.ScriptsDB[CurrentSlot] = scriptBox.Text end)

local SecTheme, _ = CreateSection(Cfg_L, "🎨 Paleta de Cores")
local colorGrid = Instance.new("Frame", SecTheme)
colorGrid.Size = UDim2.new(1, 0, 0, 40)
colorGrid.BackgroundTransparency = 1
local colorLayout = Instance.new("UIListLayout", colorGrid)
colorLayout.FillDirection = Enum.FillDirection.Horizontal
colorLayout.Padding = UDim.new(0, 8)
colorLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center

local Palette = {
    Color3.fromRGB(0, 200, 120),
    Color3.fromRGB(255, 70, 70),
    Color3.fromRGB(60, 140, 255),
    Color3.fromRGB(150, 60, 255),
    Color3.fromRGB(255, 150, 0),
    Color3.fromRGB(255, 255, 255)
}

for i, colorVal in ipairs(Palette) do
    local btn = Instance.new("TextButton", colorGrid)
    btn.Size = UDim2.new(0, 24, 0, 24)
    btn.BackgroundColor3 = colorVal
    btn.Text = ""
    Instance.new("UICorner", btn).CornerRadius = UDim.new(1, 0)
    
    btn.MouseButton1Click:Connect(function()
        Theme.Accent = colorVal
        RN_Data.AccentColor = {math.floor(colorVal.R*255), math.floor(colorVal.G*255), math.floor(colorVal.B*255)}
        SaveConfigs()
        
        Title.TextColor3 = Theme.Accent
        MainStroke.Color = Theme.Accent
        FloatStroke.Color = Theme.Accent
        FloatClick.TextColor3 = Theme.Accent
        if ActiveTab then ActiveTab.TextColor3 = Theme.Accent end
        
        for _, te in pairs(ToggleElements) do
            if te.getState() then te.bg.BackgroundColor3 = Theme.Accent end
        end
        FOVCircle.Color = Theme.Accent
    end)
end

local SecHotkeys, _ = CreateSection(Cfg_L, "⌨️ Hotkeys (Teclado)")
CreateLabel(SecHotkeys, "RightShift: Abrir/Fechar", Theme.DarkText)
CreateLabel(SecHotkeys, "Delete: Destruir GUI (Panic)", Theme.DarkText)
CreateLabel(SecHotkeys, "End: FloatBtn", Theme.DarkText)

local SecSaveLoad, _ = CreateSection(Cfg_R, "💾 Save & Load")
CreateButton(SecSaveLoad, "💾 Forçar Salvar Configurações", function() SaveConfigs() end)
CreateButton(SecSaveLoad, "🗑️ Resetar Tudo Padrão", function()
    RN_Data = {
        ScriptsDB = {"", "", "", "", "", "", "", "", "", ""},
        Speed = 16, Jump = 50, AccentColor = {0, 200, 120}, FlySpeed = 60,
        FarmPlayerOffset = -2, FarmNPCOffset = -2, FarmItemSpeed = 120, TweenChaseSpeed = 100,
        SpinSpeed = 5, AimbotSmooth = 0.10, AimbotFOV = 80, HitboxSize = 10, NPCHitboxSize = 20,
        ESPDir = "workspace.Items", FarmNPCDir = "workspace.NPCs", FarmItemDir = "workspace.Drops",
        AntiVoid = false
    }
    SaveConfigs()
end)

local SecInfo, _ = CreateSection(Cfg_R, "ℹ️ Informações")
CreateLabel(SecInfo, "RN TEAM - Clean Edition", Theme.Accent)
CreateLabel(SecInfo, "Otimizado para Mobile", Theme.DarkText)
CreateLabel(SecInfo, "Salva tudo automaticamente", Theme.DarkText)

UserInputService.InputBegan:Connect(function(inp, gameProcessed)
    if gameProcessed then return end
    if inp.KeyCode == Enum.KeyCode.RightShift then
        MainFrame.Visible = not MainFrame.Visible
    elseif inp.KeyCode == Enum.KeyCode.Delete then
        ScreenGui:Destroy()
    elseif inp.KeyCode == Enum.KeyCode.End then
        FloatingBtn.Visible = not FloatingBtn.Visible
    end
end)
